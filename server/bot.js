'use strict';
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const request = require('request');
const fetch = require('node-fetch');

//Global variable
app.set('searchable', null);
// Set all the environment variables
require('dotenv').config({ path: './config/.env' });

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.listen(8989, () => console.log('Zoky is talking on 8989'));

app.get('/', (req, res) => res.send('Zoky says Hi...'));

// Adds support for GET requests to our webhook
app.get('/webhook', (req, res) => {

  // Parse the query params
  let mode = req.query['hub.mode'];
  let token = req.query['hub.verify_token'];
  let challenge = req.query['hub.challenge'];
  // Checks if a token and mode is in the query string of the request
  if (mode && token) {
      // Checks the mode and token sent is correct
      if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {

          // Responds with the challenge token from the request
          console.log('WEBHOOK_VERIFIED');
          res.status(200).send(challenge);

      } else {
          // Responds with '403 Forbidden' if verify tokens do not match
          res.sendStatus(403);
      }
  }
});


// Creates the endpoint for our webhook
app.post('/webhook', (req, res) => {

  let body = req.body;

  if (body.object === 'page') {

      // Iterates over each entry - there may be multiple if batched
      body.entry.forEach(function(entry) {

          // Gets the message. entry.messaging is an array, but
          // will only ever contain one message, so we get index 0
          let webhookEvent = entry.messaging[0];
          console.log(webhookEvent);

          // Get the sender PSID
          let senderPsid = webhookEvent.sender.id;
          console.log('Sender PSID: ' + senderPsid);

          // Check if the event is a message or postback and
          // pass the event to the appropriate handler function
          if (webhookEvent.message) {
              console.log(webhookEvent.message);
              handleMessage(senderPsid, webhookEvent.message);
          } else if (webhookEvent.postback) {
              console.log(webhookEvent.postback);
              handlePostback(senderPsid, webhookEvent.postback);
          }
      });

      // Returns a '200 OK' response to all requests
      res.status(200).send('EVENT_RECEIVED');
  } else {
      // Returns a '404 Not Found' if event is not from a page subscription
      res.sendStatus(404);
  }
});

const askCallTemplate = (text) => {
    return {
        'attachment':{
            'type':'template',
            'payload':{
                'template_type':'button',
                'text': text || 'Contact Us',
                'buttons': [
                    {
                        'type':'phone_number',
                        'title':'Call Representative',
                        'payload':'+15105551234'
                    },
                    {
                        'type':'postback',
                        'title':'Back',
                        'payload':'backToTop'
                    }
                ]
            }
        }
    };
};

const askTemplate = (text) => {
    return {
        'attachment':{
            'type':'template',
            'payload':{
                'template_type':'button',
                'text': text,
                'buttons':[
                    {
                        'type':'postback',
                        'title':'FOOTBALL NEWS',
                        'payload':'Football'
                    },
                    {
                        'type':'postback',
                        'title':'Movie Review',
                        'payload':'Movie'
                    }
                ]
            }
        }
    };
};

// Sends response messages via the Send API
const callSendAPI = (senderPsid, response, cb = null) => {
    // Construct the message body
    let requestBody = {
        'recipient': {
            'id': senderPsid
        },
        'message': response
    };

    // Send the HTTP request to the Messenger Platform
    request({
        'uri': 'https://graph.facebook.com/v2.6/me/messages',
        'qs': { 'access_token': process.env.access_token },
        'method': 'POST',
        'json': requestBody
    }, (err, res, body) => {
        if (!err) {
            if(cb){
                cb();
            }
        } else {
            console.error('Unable to send message:', err);
        }
    });
};

// Handles messages events
const handleMessage = async (sender_psid, receivedMessage) => {
    let response = askCallTemplate();

    if (receivedMessage.text && app.get('searchable') === 'movie') {
        try {
            const resp = await fetch(`${process.env.movieApi}?s=${receivedMessage.text}&apikey=${process.env.movieApikey}`);
            const json = await resp.json();
            if(json && json.Search) {
                response = urlTemplate(json.Search[0].Poster, sender_psid);
            }
        } catch (error) {
            console.log(error);
        }
    } else if (receivedMessage.text && app.get('searchable') === 'football') {
        try {
            const resp = await fetch(`${process.env.footballApi}?s=${receivedMessage.text}&apikey=${process.env.apikey}`);
            const json = await resp.json();
            if(json && json.Search) {
                response = urlTemplate(json.Search[0].Poster, sender_psid);
            }
        } catch (error) {
            console.log(error);
        }
    }
    callSendAPI(sender_psid, response, function() {
        callSendAPI(sender_psid, askTemplate('Show me more'));
    });
};

// Handles postback events
const handlePostback = (sender_psid, received_postback) => {
    let response;

    // Get the payload for the postback
    let payload = received_postback.payload;

    // Set the response based on the postback payload
    if (payload === 'Football') {
        response = 'Type a football team name';
        app.set('searchable', 'football');
        callSendAPI(sender_psid, response, function(){
            callSendAPI(sender_psid, askCallTemplate('type a football team name!'));
        });
    } else if (payload === 'Movie') {
        response = 'Type a movie name';
        app.set('searchable', 'movie');
        callSendAPI(sender_psid, response, function(){
            callSendAPI(sender_psid, askCallTemplate('type a movie name!'));
        });
    } else if(payload === 'GET_STARTED' || payload === 'backToTop'){
        response = askTemplate('Are you a Sport Lover or Movie Lover?');
        callSendAPI(sender_psid, response);
    }
};

const urlTemplate = (url, sender_id) => {
    return {
        'attachment':{
            'type':'image',
            'payload':{
                'url': url,
                'is_reusable':true
            }
        }
    };
};
