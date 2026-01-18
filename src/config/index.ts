import http from 'node:http';
import https from 'node:https';

const {
  PORTER_SERVER_HOST = "porter-sandeep.fly.dev"
} = process.env;

const isLocalHost = PORTER_SERVER_HOST === "localhost";
const caller = isLocalHost ? http : https;

const localConfig = {
  host: 'localhost',
  port: 9000,
}

const serverConfig = {
  host: PORTER_SERVER_HOST,
}


const hostConfig = isLocalHost ? localConfig : serverConfig;

const REQ_BODY = {
  ...hostConfig,

  path: '/agent',
  method: "GET",
  headers: {
    Connection: "Upgrade",
    Upgrade: "tunnel",
  },
};

const publicUrl = `http${isLocalHost ? '' : 's'}://${PORTER_SERVER_HOST}/{tunnelId}`;

export { REQ_BODY, caller, publicUrl };
