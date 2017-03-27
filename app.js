'use strict';

const Hapi = require('hapi'),
      Joi = require('joi'),
      WebClient = require('@slack/client').WebClient,
      url = require('url'),
      path = require('path'),
      mongoose = require('mongoose'),
      User = require('./models/user');

mongoose.Promise = Promise;
mongoose.connect(process.env.MONGODB_URI);

const rootHandler = function(request, reply, source, rootErr) {
  if (rootErr) return reply({ text: 'An error has occurred :pray:' });

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

  getUser(userID).then((user) => {
    const slackClient = new WebClient(user.token);

    return getEmoji(slackClient, emoji).then((image) => {
      return slackClient.chat.postMessage(channelID, '', {
        as_user: true,
        text: '',
        attachments: [{
          color: '#fff',
          text: '',
          image_url: image,
        }],
      }).then(() => {
        reply();
      });
    });
  }).catch((err) => {
    reply({
      text: err.message,
    });
  });
}

const rootValidates = {
  payload: {
    token: Joi.string().valid(process.env.SLACK_VERIFICATION_TOKEN).options({
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

function getEmoji(client, emoji) {
  return client.emoji.list().then((res) => {
      const emojis = res.emoji || {};
      if (!emojis[emoji]) throw new Error(`${emoji} is missing or an error has occurred. please try again :pray:`);
      return emojis[emoji];
  });
}

function getUser(userID) {
  return User.findOne({ id: userID }).then((user) => {
    if (!user) throw new Error(`You are not authorized. Please sign up from ${process.env.URL}`);
    return user;
  });
}

const server = new Hapi.Server({
  connections: {
    routes: {
      files: {
        relativeTo: path.join(__dirname, 'public')
      }
    }
  }
});

server.connection({port: (process.env.PORT || 8124)});

server.register(require('inert'), () => {});

server.register(require('vision'), (err) => {
  server.views({
    engines: {
      html: require('handlebars'),
    },
    relativeTo: __dirname,
    path: 'templates',
    layout: true,
    layoutPath: path.join(__dirname, 'templates/layout'),
  });
});

server.route({
  method: 'POST',
  path:'/',
  config: {
    validate: rootValidates,
  },
  handler: rootHandler,
});

server.route({
  method: 'GET',
  path:'/',
  handler: (request, reply) => {
    reply.view('index', null);
  },
});

server.route({
    method: 'GET',
    path: '/{param*}',
    handler: {
      directory: {
        path: '.',
        redirectToSlash: true,
        index: true
      }
    }
});

server.register(require('bell'), (err) => {
  server.auth.strategy('slack', 'bell', {
      provider: 'slack',
      password: 'cookie_encryption_password_secure',
      clientId: process.env.SLACK_CLIENT_ID,
      clientSecret: process.env.SLACK_CLIENT_SECRET,
      isSecure: false
  });

  server.route({
      method: ['GET', 'POST'],
      path: '/auth',
      config: {
        auth: 'slack',
        handler: function (request, reply) {
          const { user_id: id, access_token: token } = request.auth.credentials.profile;

          const user = new User({ id, token });

          User.update({ id }, user, { upsert: true }, (err) => {
            if (err) {
              reply(`An error has occurred. please try agein. <a href="${process.env.URL}">${process.env.URL}</a>`);
            } else {
              reply('Success');
            }
          });
        }
      }
  });

  server.start(() => {
    console.log('Server running at:', server.info.uri);
  });
});
