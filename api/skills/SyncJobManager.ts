import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { v4 as uuidv4 } from 'uuid';

export interface LogEntry {
  timestamp: string;
  source: 'stdout' | 'stderr' | 'system';
  message: string;
}

export interface SyncJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  logs: LogEntry[];
  startTime: string;
  endTime?: string;
  exitCode?: number | null;
  skillsRegistered?: number;
  postProcessSummary?: {
    translationQueuedAdded: number;
    auditPendingAdded: number;
    vectorizationPendingAdded: number;
    capturedAt: string;
  };
}

class SyncJobManager extends EventEmitter {
  private jobs: Map<string, SyncJob> = new Map();
  private readonly JOB_TTL_MS = 3600000;
  private readonly CLEANUP_INTERVAL_MS = 300000;

  constructor() {
    super();
    setInterval(() => this.cleanupOldJobs(), this.CLEANUP_INTERVAL_MS);
  }

  private cleanupOldJobs() {
    const now = Date.now();
    for (const [id, job] of this.jobs.entries()) {
      if (job.status === 'completed' || job.status === 'failed') {
        const endTime = job.endTime ? new Date(job.endTime).getTime() : 0;
        if (endTime && now - endTime > this.JOB_TTL_MS) {
          this.jobs.delete(id);
        }
      }
    }
  }

  createJob(): string {
    const id = uuidv4();
    const job: SyncJob = {
      id,
      status: 'pending',
      logs: [],
      startTime: new Date().toISOString(),
    };
    this.jobs.set(id, job);
    this.addLog(id, 'system', `Job ${id} created.`);
    return id;
  }

  getJob(id: string): SyncJob | undefined {
    return this.jobs.get(id);
  }

  public addLog(id: string, source: LogEntry['source'], message: string) {
    const job = this.jobs.get(id);
    if (!job) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      source,
      message,
    };
    job.logs.push(entry);
    this.emit(`log:${id}`, entry);
  }

  async runCommand(id: string, command: string, args: string[], cwd: string) {
    const job = this.jobs.get(id);
    if (!job) return;

    job.status = 'running';
    if (!job.skillsRegistered) job.skillsRegistered = 0;
    this.addLog(id, 'system', `Executing: ${command} ${args.join(' ')}`);

    return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      let stdoutBuffer = '';
      let stderrBuffer = '';
      const proc = spawn(command, args, { cwd });

      proc.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        stdoutBuffer += data.toString();
        lines.forEach((line: string) => {
          if (line.trim()) {
            this.addLog(id, 'stdout', line);
            // Count registered skills from register_skills.py output
            if (line.includes('registered:') && line.includes('->')) {
              job.skillsRegistered = (job.skillsRegistered || 0) + 1;
            }
          }
        });
      });

      proc.stderr.on('data', (data) => {
        const lines = data.toString().split('\n');
        stderrBuffer += data.toString();
        lines.forEach((line: string) => {
          if (line.trim()) this.addLog(id, 'stderr', line);
        });
      });

      proc.on('close', (code) => {
        job.exitCode = code;
        if (code === 0) {
          this.addLog(id, 'system', `Command completed successfully (exit code 0)`);
          resolve({ stdout: stdoutBuffer, stderr: stderrBuffer });
        } else {
          this.addLog(id, 'system', `Command failed with exit code ${code}`);
          job.status = 'failed';
          reject(
            Object.assign(new Error(`Exit code ${code}`), {
              stdout: stdoutBuffer,
              stderr: stderrBuffer,
            }),
          );
        }
      });

      proc.on('error', (err) => {
        // Normalize errors from child process events
        (async () => {
          const { normalizeError } = await import('../utils/errors.js');
          const e = normalizeError(err);
          this.addLog(id, 'system', `Process error: ${e.message}`);
          job.status = 'failed';
          reject(e);
        })();
      });
    });
  }

  completeJob(id: string, success: boolean = true) {
    const job = this.jobs.get(id);
    if (!job) return;

    job.status = success ? 'completed' : 'failed';
    job.endTime = new Date().toISOString();
    if (job.skillsRegistered && job.skillsRegistered > 0) {
      this.addLog(
        id,
        'system',
        `Job ${job.status}. Total skills registered: ${job.skillsRegistered}`,
      );
    } else {
      this.addLog(id, 'system', `Job ${job.status}.`);
    }
    this.emit(`complete:${id}`, job);
  }

  setPostProcessSummary(
    id: string,
    summary: {
      translationQueuedAdded: number;
      auditPendingAdded: number;
      vectorizationPendingAdded: number;
      capturedAt?: string;
    },
  ) {
    const job = this.jobs.get(id);
    if (!job) return;
    job.postProcessSummary = {
      translationQueuedAdded: summary.translationQueuedAdded,
      auditPendingAdded: summary.auditPendingAdded,
      vectorizationPendingAdded: summary.vectorizationPendingAdded,
      capturedAt: summary.capturedAt || new Date().toISOString(),
    };
  }
}

export const syncJobManager = new SyncJobManager();
