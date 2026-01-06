/**
 * CLI Utilities
 *
 * Utility functions for the CLI.
 */

import net from "net";

/**
 * Check if the proxy server is running on the specified port.
 *
 * @param port - Port to check
 * @returns True if server is running (port is in use)
 */
export async function isServerRunning(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    socket.setTimeout(1000);

    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });

    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, "127.0.0.1");
  });
}
