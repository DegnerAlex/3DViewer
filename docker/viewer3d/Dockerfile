# Copyright 2026 Alex Degner (alex@ergofox.me)
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

FROM ubuntu:24.04

RUN apt-get update && apt-get install -y
RUN apt install -y libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  pkg-config libudev-dev libasound2-dev libpcsclite-dev \
  cmake \
  git

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y 
ENV PATH="/root/.cargo/bin:${PATH}"
RUN rustup update

RUN cargo install tauri-cli --version "^2.0.0" --locked && \
    cargo install create-tauri-app --locked

RUN apt-get install -y \
    libwayland-client0 \
    libwayland-egl1 \
    libwayland-cursor0

RUN apt-get install -y \
    clang \
    fuse3

RUN curl -sL https://deb.nodesource.com/setup_22.x | bash - && \
        apt-get install -y nodejs && \
        npm install --global --allow-scripts=pnpm pnpm

