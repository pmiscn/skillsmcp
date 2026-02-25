FROM python:3.10-slim
WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py /app/app.py
COPY ../stable-video-diffusion /app/stable-video-diffusion
COPY ../movie-diffusion /app/movie-diffusion
COPY ../modelscope-t2v /app/modelscope-t2v
EXPOSE 8080
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
