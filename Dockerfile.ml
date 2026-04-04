FROM python:3.11-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1
COPY ml/requirements.txt ./ml_requirements.txt
RUN apt-get update && apt-get install -y build-essential curl && rm -rf /var/lib/apt/lists/*
RUN python -m pip install --upgrade pip
RUN python -m pip install -r ml_requirements.txt
COPY ml ./ml
# expose inference port
EXPOSE 8000
CMD ["uvicorn", "ml.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
