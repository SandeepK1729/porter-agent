import http2 from "http2";

const URL = process.env.PORTER_SERVER_URL || "https://localhost:9000";
console.log("Connecting to Porter Server at:", URL);
const client = http2.connect(URL, {
  rejectUnauthorized: false, // dev only
});

export default client;
