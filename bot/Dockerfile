FROM pytorch/pytorch:latest

# requirements
RUN apt-get update -y && apt-get install -y git && pip install comfy-cli
RUN apt install curl -y

WORKDIR /ComfyUI

# install ComfyUI + Manager
RUN git clone https://github.com/comfyanonymous/ComfyUI /ComfyUI && \
    pip install -r requirements.txt && \
    cd custom_nodes && \
    git clone https://github.com/Comfy-Org/ComfyUI-Manager && \
    cd ComfyUI-Manager && \
    pip install -r requirements.txt

# setup entrypoint script, which runs python main.py
COPY entry.sh /bin/comfyui
RUN chmod +x /bin/comfyui
ENTRYPOINT ["comfyui"]

# default command to run ComfyUI with CPU support and latest frontend version
# CMD ["--cpu", "--listen", "0.0.0.0", "--front-end-version", "Comfy-Org/ComfyUI_frontend@latest"]

EXPOSE 8188