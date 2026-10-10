export declare function startRemoteServer(port?: number): {
  server: import('node:http').Server
  token: string
  port: number
  stop: () => void
}
export declare function getLanIp(): string
