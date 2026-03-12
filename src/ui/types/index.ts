import { ConnectionStartPayload } from "@/util/buffer";

type EventData<T> = {
  timestamp: number;
} & T;

class RequestRecord {
  public requestId: string;
  public method: string;
  public path: string;
  public reqHeaders: Record<string, unknown>;
  public reqBodyChunks: string[]; // base64 encoded chunks
  public responseStatus: number | null;
  public resHeaders: Record<string, unknown>;
  public resBodyChunks: string[]; // base64 encoded chunks
  public startTime: number;
  public endTime: number | null;
  public done: boolean;


  constructor({ requestId, payload, timestamp }: EventData<any>) {
    this.requestId = requestId;

    this.method = payload.method;
    this.path = payload.path;
    this.reqHeaders = payload.headers;

    this.startTime = timestamp;

    this.reqBodyChunks = [];
    this.resHeaders = {};
    this.resBodyChunks = [];
    this.responseStatus = null;
    this.endTime = null;
    this.done = false;
  }

  log(x: any) {
    console.log(`[${this.requestId}]`, x, 'json:', JSON.stringify(x));
  }

  addRequestBody = ({ payload }: EventData<{ payload: ConnectionStartPayload }>) => {
    if (!payload) return;
    this.reqBodyChunks.push(payload);
  }

  addResponseBody = ({ payload }: EventData<{ payload: ConnectionStartPayload }>) => {
    if (!payload) return;
    this.resBodyChunks.push(payload);
  }

  setResponseStart = ({ payload }: EventData<{ payload: ConnectionStartPayload }>) => {
    this.responseStatus = payload?.status;
    this.resHeaders = payload?.headers || {};
  }

  setResponseEnd = ({ timestamp }: EventData<{}>) => {
    this.endTime = timestamp;
    this.done = true;
  }

}


export { RequestRecord };
