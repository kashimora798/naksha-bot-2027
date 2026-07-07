FROM python:3.10-slim

# Install Tesseract OCR engine, OpenCV dependencies, and cleaning files
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy Python scripts
COPY main.py .
COPY hlb_extractor.py .
COPY osm_enrichment.py .

EXPOSE 8000

# Run uvicorn server via python to respect Render's dynamic PORT environment variable
CMD ["python", "main.py"]
