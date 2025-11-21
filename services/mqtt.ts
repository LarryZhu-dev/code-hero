import mqtt from 'mqtt';

const BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';

export class NetworkService {
    client: mqtt.MqttClient | null = null;
    roomId: string = '';
    playerId: string = '';
    onMessage: (topic: string, payload: any) => void = () => {};

    connect(roomId: string, playerId: string, onMessage: (t: string, p: any) => void) {
        this.roomId = roomId;
        this.playerId = playerId;
        this.onMessage = onMessage;

        this.client = mqtt.connect(BROKER_URL, {
            clientId: `cw_${playerId}_${Math.random().toString(16).slice(2, 8)}`,
            clean: true,
            keepalive: 60,
        });

        this.client.on('connect', () => {
            console.log('Connected to EMQX');
            this.client?.subscribe(`cw/room/${roomId}/#`);
            this.publish('join', { id: playerId });
        });

        this.client.on('message', (topic, msg) => {
            try {
                const data = JSON.parse(msg.toString());
                this.onMessage(topic, data);
            } catch (e) {
                console.error('Failed to parse MQTT msg', e);
            }
        });
    }

    publish(action: string, data: any) {
        if (this.client) {
            this.client.publish(`cw/room/${this.roomId}/${action}`, JSON.stringify({
                sender: this.playerId,
                ...data
            }));
        }
    }

    disconnect() {
        this.client?.end();
    }
}

export const net = new NetworkService();