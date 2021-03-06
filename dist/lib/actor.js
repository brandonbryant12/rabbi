"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const logger_1 = require("./logger");
const amqp_1 = require("./amqp");
const publicIp = require('public-ip');
const os = require("os");
const bsv = require("bsv");
class Actor extends events_1.EventEmitter {
    constructor(actorParams) {
        super();
        this.heartbeatMilliseconds = 10000; // Timeout from setInterval
        this.hostname = os.hostname();
        this.actorParams = actorParams;
        if (!actorParams.queue) {
            this.actorParams.queue = actorParams.routingkey;
        }
        if (!actorParams.routingkey) {
            this.actorParams.routingkey = actorParams.queue;
        }
        if (!this.privateKey) {
            this.privateKey = new bsv.PrivateKey();
            this.id = this.privateKey.toAddress().toString();
        }
    }
    toJSON() {
        return {
            exchange: this.actorParams.exchange,
            routingkey: this.actorParams.routingkey,
            queue: this.actorParams.queue,
            id: this.privateKey.toAddress().toString(),
            hostname: this.hostname,
            ip: this.ip
        };
    }
    connectAmqp(connection) {
        return __awaiter(this, void 0, void 0, function* () {
            if (connection) {
                this.connection = connection;
            }
            else {
                this.connection = yield amqp_1.getConnection();
                logger_1.log.info(`rabbi.amqp.connected`);
            }
            this.channel = yield this.connection.createChannel();
            logger_1.log.info('rabbi.amqp.channel.created');
            try {
                let result = yield this.channel.checkExchange(this.actorParams.exchange);
            }
            catch (error) {
                yield this.channel.assertExchange(this.actorParams.exchange, 'topic');
            }
            yield this.channel.assertQueue(this.actorParams.queue);
            logger_1.log.debug('rabbi.amqp.binding.created', this.toJSON());
            yield this.channel.bindQueue(this.actorParams.queue, this.actorParams.exchange, this.actorParams.routingkey);
            yield this.channel.prefetch(3);
            return this.channel;
        });
    }
    static create(connectionInfo) {
        let actor = new Actor(connectionInfo);
        return actor;
    }
    defaultConsumer(channel, msg, json) {
        return __awaiter(this, void 0, void 0, function* () {
            let message = this.toJSON();
            message.message = msg.content.toString();
            logger_1.log.info(message);
        });
    }
    stop() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
            }
        });
    }
    start(consumer) {
        return __awaiter(this, void 0, void 0, function* () {
            process.on('SIGINT', () => __awaiter(this, void 0, void 0, function* () {
                yield this.channel.publish('rabbi', 'actor.stopped', Buffer.from(JSON.stringify(this.toJSON())));
                setTimeout(() => {
                    this.channel.close();
                    process.kill(process.pid, 'SIGKILL');
                }, 2000);
            }));
            var json;
            let channel = yield this.connectAmqp(this.actorParams.connection);
            this.ip = yield publicIp.v4();
            yield channel.publish('rabbi', 'actor.started', Buffer.from(JSON.stringify(this.toJSON())));
            this.heartbeatInterval = setInterval(() => __awaiter(this, void 0, void 0, function* () {
                yield channel.publish('rabbi', 'actor.heartbeat', Buffer.from(JSON.stringify(this.toJSON())));
            }), this.heartbeatMilliseconds);
            channel.consume(this.actorParams.queue, (msg) => __awaiter(this, void 0, void 0, function* () {
                try {
                    json = JSON.parse(msg.content.toString());
                }
                catch (error) {
                }
                if (this.schema) {
                    let result = this.schema.validate(json);
                    if (result.error) {
                        logger_1.log.error('schema.invalid', result.error);
                        return channel.ack(msg);
                    }
                }
                if (consumer) {
                    try {
                        let result = yield consumer(channel, msg, json);
                    }
                    catch (error) {
                        console.error('rabbi.exception.caught', error.message);
                        yield channel.ack(msg); // auto acknowledge
                    }
                }
                else {
                    this.defaultConsumer(channel, msg, json);
                }
            }));
        });
    }
}
exports.Actor = Actor;
//# sourceMappingURL=actor.js.map