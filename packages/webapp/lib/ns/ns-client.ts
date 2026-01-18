import { io, Socket } from 'socket.io-client';
import { configManager } from '../config/config-manager';

export interface NSClientOptions {
    baseUrl: string;
    apiKey: string;
    version: string;
    commitId: string;
}

export class NightscoutClient {
    private socket: Socket | null = null;
    private options: NSClientOptions;
    private clientId: string;
    private jwt: string | null = null;
    private jwtExpiry: number = 0;

    constructor(options: NSClientOptions) {
        this.options = options;
        this.clientId = `freddy-${options.version}-${options.commitId}`;
    }

    /**
     * Obtains a valid JWT using the API Key (Access Token).
     * Caches the token until it's close to expiry.
     */
    private async getJWT(): Promise<string> {
        // Return cached token if valid (with 1-minute buffer)
        if (this.jwt && Date.now() < this.jwtExpiry - 60000) {
            return this.jwt;
        }

        const baseUrl = this.options.baseUrl.replace(/\/api\/v3\/?$/, '').replace(/\/$/, '');
        const authUrl = `${baseUrl}/api/v2/authorization/request/${this.options.apiKey}`;

        console.error(`NSClient: Requesting new JWT from ${authUrl}...`);
        const response = await fetch(authUrl, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': this.clientId
            }
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(`NS Auth Error (${response.status}): ${error.message || response.statusText}`);
        }

        const data = await response.json();
        this.jwt = data.token;

        // Use standard 1-hour expiry if not provided (V2 usually doesn't provide exp in response body)
        // But we can decode it if we want. For now, 55 mins is safe.
        this.jwtExpiry = Date.now() + 55 * 60 * 1000;

        return this.jwt!;
    }

    /**
     * Connect to the Nightscout Socket.IO storage namespace.
     */
    public async connectWebSocket(onEvent: (event: string, data: any) => void): Promise<void> {
        if (this.socket?.connected) return;

        // Strip /api/v3 from base URL for socket connection if present
        const socketBaseUrl = this.options.baseUrl.replace(/\/api\/v3\/?$/, '');
        const socketUrl = `${socketBaseUrl}/storage`;

        console.error(`Connecting to NS WebSocket: ${socketUrl}`);

        this.socket = io(socketUrl, {
            query: {
                accessToken: this.options.apiKey,
                clientId: this.clientId
            },
            transports: ['websocket']
        });

        this.socket.on('connect', () => {
            console.error('NS WebSocket connected');
            this.socket?.emit('subscribe', {
                accessToken: this.options.apiKey,
                collections: ['entries', 'treatments', 'profile', 'devicestatus']
            }, (data: any) => {
                if (data.success) {
                    console.error('Subscribed to NS collections:', data.collections);
                } else {
                    console.error('NS WebSocket subscription failed:', data.message);
                }
            });
        });

        this.socket.on('create', (data: any) => onEvent('create', data));
        this.socket.on('update', (data: any) => onEvent('update', data));
        this.socket.on('delete', (data: any) => onEvent('delete', data));

        this.socket.on('connect_error', (error) => {
            console.error('NS WebSocket connection error:', error.message);
        });

        this.socket.on('disconnect', (reason) => {
            console.error('NS WebSocket disconnected:', reason);
        });
    }

    public disconnectWebSocket(): void {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }

    /**
     * Fetch data via REST API V3.
     */
    public async fetchRest(collection: string, params: Record<string, any> = {}): Promise<any> {
        const queryParams = new URLSearchParams(params);
        const jwt = await this.getJWT();

        // V3 Generic endpoints are at /api/v3/{collection}
        const baseUrl = this.options.baseUrl.replace(/\/api\/v3\/?$/, '').replace(/\/$/, '');
        const url = `${baseUrl}/api/v3/${collection}?${queryParams.toString()}`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${jwt}`,
                'Accept': 'application/json',
                'User-Agent': this.clientId,
                'X-Freddy-Client': this.clientId
            }
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(`NS API Error (${response.status}): ${error.message || response.statusText}`);
        }

        const data = await response.json();
        return data.result || data; // Fallback to raw data if result is missing
    }

}

// Global instance helper
let clientInstance: NightscoutClient | null = null;

export function getNSClient(): NightscoutClient | null {
    if (clientInstance) return clientInstance;

    const config = configManager.getSystemConfig();
    if (!config.nightscout_url || !config.nightscout_api_key) {
        return null;
    }

    clientInstance = new NightscoutClient({
        baseUrl: config.nightscout_url,
        apiKey: config.nightscout_api_key,
        version: '2.0.0', // TODO: Get from package.json dynamically
        commitId: 'b7fb041' // TODO: Get from build process
    });

    return clientInstance;
}
