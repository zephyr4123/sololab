FROM python:3.12-slim

RUN pip install --no-cache-dir \
    matplotlib==3.9.* \
    plotly==6.0.* \
    pandas==2.2.* \
    numpy==2.1.* \
    seaborn==0.13.* \
    kaleido==0.2.* \
    Pillow==11.* \
    scipy==1.14.*

WORKDIR /sandbox
COPY backend/src/sololab/modules/writer/sandbox/runner.py /sandbox/runner.py

RUN useradd -m -s /bin/bash sandbox && \
    mkdir -p /output && \
    chown sandbox:sandbox /output

USER sandbox

ENTRYPOINT ["python", "/sandbox/runner.py"]
