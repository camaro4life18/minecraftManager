FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY asusrouter ./asusrouter
RUN pip install --no-cache-dir ./asusrouter

COPY app.py ./

ENV PYTHONUNBUFFERED=1
ENV ROUTER_SERVICE_PORT=7001

CMD ["python", "app.py"]
