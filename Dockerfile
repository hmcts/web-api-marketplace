# ---- Base image ----
FROM hmctsprod.azurecr.io/base/node:22-alpine as base
USER root
RUN corepack enable
WORKDIR /opt/app
RUN chown -R 65532:65532 /opt/app
COPY --chown=65532:65532 . .
ENV HOME=/tmp
ENV COREPACK_HOME=/tmp/.corepack
USER 65532:65532

# ---- Build image ----
FROM base as build
RUN yarn install && yarn build:prod

# ---- Runtime image ----
FROM build as runtime
RUN rm -rf webpack/ webpack.config.js
EXPOSE 3344
