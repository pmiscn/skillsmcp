'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Folder,
  FileCode,
  ChevronRight,
  Loader2,
  File,
  FileJson,
  Image as ImageIcon,
  AlertCircle,
  RefreshCcw,
} from 'lucide-react';
import { api, SkillFile } from '@/lib/api';
import { cn } from '@/lib/utils';

interface FileTreeProps {
  skillId: string;
  onFileSelect: (path: string) => void;
  selectedFile?: string | null;
}

interface FileNodeProps {
  file: SkillFile;
  skillId: string;
  level: number;
  onFileSelect: (path: string) => void;
  selectedFile?: string | null;
}

const getFileIcon = (filename: string) => {
  if (filename.endsWith('.json')) return <FileJson className="w-4 h-4" />;
  if (
    filename.endsWith('.ts') ||
    filename.endsWith('.tsx') ||
    filename.endsWith('.js') ||
    filename.endsWith('.jsx')
  )
    return <FileCode className="w-4 h-4" />;
  if (filename.endsWith('.png') || filename.endsWith('.jpg') || filename.endsWith('.svg'))
    return <ImageIcon className="w-4 h-4" />;
  return <File className="w-4 h-4" />;
};

const FileNode: React.FC<FileNodeProps> = ({
  file,
  skillId,
  level,
  onFileSelect,
  selectedFile,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [children, setChildren] = useState<SkillFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSelected = selectedFile === file.path;
  const isDirectory = file.type === 'directory';

  const loadFiles = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.listSkillFiles(skillId, file.path);
      const files = Array.isArray(response) ? response : response.files || [];

      const sortedFiles = files.sort((a: SkillFile, b: SkillFile) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'directory' ? -1 : 1;
      });

      setChildren(sortedFiles);
      setHasLoaded(true);
    } catch (err) {
      console.error('Failed to load files:', err);
      setError('Failed to load content');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!isDirectory) {
      onFileSelect(file.path);
      return;
    }

    setIsOpen(!isOpen);

    if (!hasLoaded && !isOpen) {
      loadFiles();
    }
  };

  return (
    <div className="select-none">
      <motion.div
        initial={false}
        className={cn(
          'flex items-center py-1.5 px-2 cursor-pointer transition-colors duration-200 rounded-lg mx-1',
          isSelected
            ? 'bg-primary/10 text-primary font-medium'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleToggle}
      >
        <span className="mr-1.5 flex-shrink-0 text-muted-foreground/70">
          {isDirectory ? (
            isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <motion.div
                initial={false}
                animate={{ rotate: isOpen ? 90 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronRight className="w-4 h-4" />
              </motion.div>
            )
          ) : (
            <span className="w-4 h-4 block" />
          )}
        </span>

        <span
          className={cn(
            'mr-2 flex-shrink-0',
            isDirectory
              ? 'text-blue-500/80 dark:text-blue-400/80'
              : 'text-slate-500 dark:text-slate-400',
          )}
        >
          {isDirectory ? <Folder className="w-4 h-4" /> : getFileIcon(file.name)}
        </span>

        <span className="truncate text-sm font-normal tracking-tight">{file.name}</span>
      </motion.div>

      <AnimatePresence>
        {isOpen && isDirectory && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            {error ? (
              <div
                className="flex items-center py-2 text-xs text-red-500/80 hover:text-red-500 transition-colors select-none"
                style={{ paddingLeft: `${(level + 1) * 12 + 12}px` }}
              >
                <AlertCircle className="w-3 h-3 mr-1.5 flex-shrink-0" />
                <span className="flex-1">Failed to load</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    loadFiles();
                  }}
                  className="ml-2 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                  title="Retry"
                >
                  <RefreshCcw className="w-3 h-3" />
                </button>
              </div>
            ) : children.length === 0 && !isLoading ? (
              <div
                className="py-1 text-xs text-muted-foreground italic"
                style={{ paddingLeft: `${(level + 1) * 16 + 12}px` }}
              >
                Empty folder
              </div>
            ) : (
              children.map((child) => (
                <FileNode
                  key={child.path}
                  file={child}
                  skillId={skillId}
                  level={level + 1}
                  onFileSelect={onFileSelect}
                  selectedFile={selectedFile}
                />
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const FileTree: React.FC<FileTreeProps> = ({ skillId, onFileSelect, selectedFile }) => {
  const [rootFiles, setRootFiles] = useState<SkillFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRootFiles = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await api.listSkillFiles(skillId);
      const files = Array.isArray(response) ? response : response.files || [];

      const sortedFiles = files.sort((a: SkillFile, b: SkillFile) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'directory' ? -1 : 1;
      });

      setRootFiles(sortedFiles);
    } catch (err) {
      console.error('Failed to load root files:', err);
      setError('Failed to load file structure. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (skillId) {
      fetchRootFiles();
    }
  }, [skillId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">Loading files...</span>
      </div>
    );
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center h-48 p-6 text-center border border-dashed border-red-200 dark:border-red-900/50 rounded-lg bg-red-50/50 dark:bg-red-900/10"
      >
        <AlertCircle className="w-8 h-8 mb-3 text-red-500" />
        <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-4">{error}</p>
        <button
          onClick={fetchRootFiles}
          className="flex items-center px-3 py-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors shadow-sm"
        >
          <RefreshCcw className="w-3 h-3 mr-1.5" />
          Retry
        </button>
      </motion.div>
    );
  }

  if (rootFiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-muted-foreground border border-dashed border-muted rounded-lg bg-muted/30">
        <Folder className="w-10 h-10 mb-3 opacity-20" />
        <span className="text-sm font-medium">No files found</span>
        <span className="text-xs text-muted-foreground/70 mt-1">
          This skill appears to be empty
        </span>
      </div>
    );
  }

  return (
    <div className="w-full font-sans">
      {rootFiles.map((file) => (
        <FileNode
          key={file.path}
          file={file}
          skillId={skillId}
          level={0}
          onFileSelect={onFileSelect}
          selectedFile={selectedFile}
        />
      ))}
    </div>
  );
};

export default FileTree;
