'use strict'

const Hapi = require('hapi');
const server = new Hapi.Server();
const Joi = require('joi');
const WebClient = require('@slack/client').WebClient;
const redis = require('redis');
const bluebird = require('bluebird');
const url = require('url');

bluebird.promisifyAll(redis.RedisClient.prototype);

const REDIS_EMOJI_KEY = 'slack_emoji';

server.connection({port: (process.env.PORT || 8124)});

const redisClient = redis.createClient(process.env.REDISTOGO_URL);
const slackClient = new WebClient(process.env.TOKEN);

const rootHandler = function(request, reply, source, rootErr) {
  console.log(request.payload);

  if (rootErr) return reply({ response_type: 'ephemeral', text: 'An error has occurred :pray:' });

  const {
    payload: {
      text,
      user_name: username,
      user_id: userID,
      channel_id: channelID,
      response_url: responseURL,
    },
  } = request;

  const emoji = text.replace(/:([^:]+):/, '$1');

  Promise.all([getEmoji(emoji), getUser(userID)]).then(([emojiImage, user]) => {
    return slackClient.chat.postMessage(channelID, '', {
      text: '',
      username: user.name,
      icon_url: user.profile.image_48,
      attachments: [{
        color: '#fff',
        text: "",
        image_url: emojiImage,
      }],
    }).then(() => {
      reply();
    });
  }).catch((err) => {
    reply({
      text: err.message,
    });
  });
}

const rootValidates = {
  payload: {
    token: Joi.string().valid(process.env.SLASH_COMMANDS_TOKEN).options({
      language: { any: { allowOnly: 'xxxxxxxxxxx' } }
    }),
    team_id: Joi.any(),
    team_domain: Joi.any(),
    channel_id: Joi.any(),
    channel_name: Joi.any(),
    user_id: Joi.any(),
    user_name: Joi.any(),
    command: Joi.string().valid('/stamp'),
    text: Joi.string().regex(/^:[^:]+:$/),
    response_url: Joi.any(),
  },
  failAction: rootHandler,
}

function getEmoji(emoji) {
  return redisClient.existsAsync(REDIS_EMOJI_KEY).then((reply) => {
    return getEmojis(reply).then((emojis) => {
        if (!emojis[emoji]) throw new Error(`${emoji} is missing or an error has occurred. please try again :pray:`);
        return emojis[emoji];
    });
  });
}

function getEmojis(isCached = 0) {
  if (isCached) {
    return redisClient.getAsync(REDIS_EMOJI_KEY).then((result) => {
      return JSON.parse(result);
    });
  } else {
    return slackClient.emoji.list().then((res) => {
      return res.emoji;
    });
  }
}

function getUser(userID) {
  return redisClient.existsAsync(userID).then((reply) => {
    if (reply) {
      return redisClient.getAsync(userID).then((user) => {
        return JSON.parse(user);
      });
    } else {
      return slackClient.users.info(userID).then(res => {
        return redisClient.setAsync(userID, JSON.stringify(res.user)).then(() => res.user);
      });
    }
  });
}

server.route({
  method: 'POST',
  path:'/',
  config: {
    validate: rootValidates,
  },
  handler: rootHandler,
});

server.start(() => {
  console.log('Server running at:', server.info.uri);
});
