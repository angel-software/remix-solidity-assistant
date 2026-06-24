import { createClient } from "@remixproject/plugin-iframe";

const client = createClient();

/**
 * Lifecycle hook executed as soon as the plugin successfully establishes handshake with Remix IDE.
 */
client.onload(async () => {
  try {
    // Request permissions to use fileManager and editor
    await client.call('manager', 'requestPermissions', {
      required: ['fileManager', 'editor']
    });
    console.log('[Remix Startup] Handshake successful, permissions registered.');
  } catch (error) {
    console.warn('[Remix Startup] Error, internal permission handshake failed:', error);
  }
});

export default client;
