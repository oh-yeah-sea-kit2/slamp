FROM node:6

RUN mkdir -p /app
WORKDIR /app

ENV PATH /root/.yarn/bin:$PATH
RUN curl -o- -L https://yarnpkg.com/install.sh | bash -s -- --version 0.21.3

COPY package.json /app/
COPY yarn.lock /app/
RUN mkdir -p /dist/node_modules && ln -s /dist/node_modules /app/node_modules && yarn
COPY . /app
