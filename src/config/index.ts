import http from 'node:http';
import https from 'node:https';

const {
  PORTER_SERVER_HOST = "porter.thesandeep.in",
} = process.env;

const isLocalHost = PORTER_SERVER_HOST === "localhost";
const caller = isLocalHost ? http : https;

const localConfig = {
  host: 'localhost',
  port: 9000,
}

const serverConfig = {
  host: 'porter-sandeep.fly.dev', // TODO: Update this to the actual server host
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

const publicUrl = isLocalHost
  ? `http://localhost/{tunnelId}`
  : `https://{tunnelId}.${PORTER_SERVER_HOST}`;

export { REQ_BODY, caller, publicUrl };
