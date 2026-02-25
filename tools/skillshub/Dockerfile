FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV SKILLSHUB_API_KEY=""
ENV SKILLSHUB_ALLOW_EXEC=0
VOLUME ["/data/index"]
CMD ["uvicorn", "service:app", "--host", "0.0.0.0", "--port", "8001"]
