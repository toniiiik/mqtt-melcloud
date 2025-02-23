const { connect } = require('mqtt');
const { melcloud } = require('./melcloud');
const { config } = require('./config');
const { version } = require('./package');
const { logger } = require('./logger.js');

const topics = {
	state: () => `${config.mqtt.path}/state`,
	device: () => `${config.mqtt.path}/device`,
	update: (id) => `${config.mqtt.path}/${id}`,
	status: (id) => `${config.mqtt.path}/${id}/status`,
	info: (id) => `${config.mqtt.path}/${id}/info`,
	diff: (id) => `${config.mqtt.path}/${id}/diff`,
	schedule: (id) => `${config.mqtt.path}/${id}/schedule`,
	change: (id) => `${config.mqtt.path}/${id}/set`,
};

const mqtt = connect(config.mqtt.host, {
	username: config.mqtt.username,
	password: config.mqtt.password,
	clientId: config.mqtt.id,
	will: {
		topic: topics.state(),
		payload: JSON.stringify({ online: false }),
		retain: true,
	},
});

const cloud = melcloud(config.melcloud);

const subsciptions = {};

const format = (type, args) => [
	`[${type.toUpperCase()}]`,
	...args,
].join(' ');

const log = (type, ...args) => logger.info(format(type, args));

const error = (type, ...args) => logger.error(format(type, args));

mqtt.on('connect', () => log('mqtt', `connected to ${config.mqtt.host}`));

cloud.on('login', () => {
	log('melcloud', `logged in as ${config.melcloud.username}`);
	log('melcloud', `polling interval is ${config.melcloud.interval}ms`);

	mqtt.publish(topics.state(), JSON.stringify({
		online: true,
		version,
	}), { retain: true });
});

cloud.on('device', (device) => {
	const topic = topics.change(device.id);
	mqtt.subscribe(topic);
	subsciptions[topic] = device;

	log('melcloud', `registed device at ${topics.update(device.id, device.building)}`);

	mqtt.publish(topics.device(), JSON.stringify(device.info), {
		retain: true,
	});

	mqtt.publish(topics.info(device.id), JSON.stringify(device.info), {
		retain: true,
	});
});

cloud.on('state', (device, state, diff) => {
	log('melcloud', `received state for ${topics.update(device.id, device.building)}`);
	log('melcloud', `  > ${JSON.stringify(diff)}`);

	mqtt.publish(topics.update(device.id, device.building), JSON.stringify(state), {
		retain: true,
	});
});

cloud.on('status', (device, state, diff) => {
	log('melcloud', `received status for ${topics.update(device.id, device.building)}`);
	log('melcloud', `  > ${JSON.stringify(diff)}`);

	mqtt.publish(topics.status(device.id, device.building), JSON.stringify(state), {
		retain: true,
	});
});

cloud.on('schedule', (device, state, diff) => {
	// log('melcloud', `schedule for ${topics.update(device.id, device.building)}`);
	// log('melcloud', `  > ${JSON.stringify(diff)}`);

	mqtt.publish(topics.schedule(device.id, device.building), JSON.stringify(state));
});

mqtt.on('message', (topic, data) => {
	const device = subsciptions[topic];

	if (!device) {
		error('mqtt', `received data for unknown device ${topic}`);
		return;
	}

	try {
		log('mqtt', `received update for ${topic}`);
		log('mqtt', `  > ${data.toString()}`);

		device.set(JSON.parse(data.toString()));
	} catch (e) {
		error('mqtt', 'not able to parse incoming message');
	}
});

mqtt.on('error', (e) => {
	error('mqtt', 'connection error');
	error('mqtt', `  > ${e.toString()}`);
});

cloud.on('error', (e) => {
	error('melcloud', 'unexpected error');
	error('melcloud', `  > ${e.toString()}`);
});

cloud.on('device/error', (device, e) => {
	error('melcloud', 'unexpected device error');
	error('melcloud', `  > ${e.toString()}`);
});
