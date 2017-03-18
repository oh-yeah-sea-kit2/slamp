'use strict'

const Hapi = require('hapi');
const server = new Hapi.Server();
const Joi = require('joi');
const WebClient = require('@slack/client').WebClient;
const request = require('request');

const slackClient = new WebClient(process.env.TOKEN);

server.connection({port: (process.env.PORT || 8124)});

const rootHandler = function(req, reply, source, rootErr) {
  console.log(req.payload);

  if (rootErr) return reply({ response_type: 'ephemeral', text: 'an error has occurred :pray:' });

  const {
    payload: {
      text,
      user_name: username,
      user_id: userID,
      channel_id: channelID,
      response_url: responseURL,
    },
  } = req;

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
    });
  }).catch((err) => {
    reply({
      text: `${text} is missing or an error has occurred. please try again :pray:`
    });
  });

  reply();
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
  return slackClient.emoji.list().then(res => {
    const emojis = res.emoji;

    if (!emojis[emoji]) return Promise.reject(new Error('Emoji is missing'));

    return emojis[emoji];
  });
}

function getUser(userID) {
  return slackClient.users.info(userID).then(res => {
    return res.user;
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
