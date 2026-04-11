FROM python:3.12-slim

# Install Chinese fonts for matplotlib CJK rendering
RUN apt-get update && apt-get install -y --no-install-recommends fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

# Use Tsinghua mirror for faster downloads in China
RUN pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple \
    && pip install --no-cache-dir --retries 5 --timeout 120 \
    numpy==2.1.* \
    scipy==1.14.* \
    matplotlib==3.9.* \
    pandas==2.2.* \
    && pip install --no-cache-dir --retries 5 --timeout 120 \
    seaborn==0.13.* \
    plotly==6.0.* \
    kaleido==0.2.* \
    Pillow==11.*

WORKDIR /sandbox
COPY backend/src/sololab/modules/writer/sandbox/runner.py /sandbox/runner.py

RUN useradd -m -s /bin/bash sandbox && \
    mkdir -p /output && \
    chown sandbox:sandbox /output

USER sandbox

ENTRYPOINT ["python", "/sandbox/runner.py"]
