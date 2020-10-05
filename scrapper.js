const dotenv = require('dotenv');
dotenv.config();
const express = require('express'); // Adding Express
var bodyParser = require('body-parser')
const app = express(); // Initializing Express
const puppeteer = require('puppeteer');
const USERNAME_SELECTOR = '#login_form > input[type=text]:nth-child(1)';
const PASSWORD_SELECTOR = '#login_form > input[type=password]:nth-child(3)';
const DEVICE_SELECTOR = 'a.deviceIcon.online';
const CTA_SELECTOR = '#login';
const CTA_LOGOUT = '#navBar > li:nth-child(4) > a'
const axios = require('axios')
var token, deviceId, innerText; 
var querystring = require('querystring');

app.use(bodyParser.urlencoded({ extended: true }))
 
// parse application/json
app.use(bodyParser.json())

const checkMyToken = require('./middleware/checkMyToken');
const { head } = require('request-promise-native');

function generateRequestUrl(){
  return token ? `https://salus-it500.com/public/ajax_device_values.php?devId=${deviceId}&token=${token}&_=${Date.now()}`: null;
}

async function makeRequestWithoutLogin() {

  let api_url = generateRequestUrl();
  if(api_url) {
    // do API request
    await axios.get(api_url).then( data => {
      innerText = data.data
    }).catch( e => {
      return res.status(404).send({'status': "salus api request error"})
    })
    return innerText 
  }
  return false
}


function checkIfRequestIsValid(data){
  if(data.CH1currentRoomTemp === "32.0" && data.CH1currentSetPoint === "32.0" && data.CH1autoOff === "") {
    return false
  }
  return true
}

async function login(page) {

  await page.goto(process.env.WEBSITE);
  await page.click(USERNAME_SELECTOR);
  await page.keyboard.type(process.env.USERNAME_EMAIL);
  await page.click(PASSWORD_SELECTOR);
  await page.keyboard.type(process.env.PASSWORD);
  await page.click(CTA_SELECTOR);
  await page.waitForNavigation();
  //await page.screenshot({path: 'salus.png'});
  await page.click(DEVICE_SELECTOR);
  await page.waitForSelector('#TabbedPanels1', {
    visible: true,
  });
  const devId = await page.$('#devId');
  deviceId = await page.evaluate(devId => devId.value, devId);
  const tk = await page.$('#token');
  token = await page.evaluate(tk => tk.value, tk);
  await page.click(CTA_LOGOUT);
  //await page.screenshot({path: 'salus.png'});

}

app.get('/api/fetchThermostatData', checkMyToken, function(req, res) {

  // Launching the Puppeteer controlled headless browser and navigate to the Digimon website
  puppeteer.launch().then(async function(browser) {
      
    const page = await browser.newPage();

    innerText = await makeRequestWithoutLogin();

    if(!innerText) {
        // make request with login 
        await login(page)
        innerText = await makeRequestWithoutLogin();

    } else {

      if(!checkIfRequestIsValid(innerText)) {
        // make request with login 
        await login(page)
        innerText = await makeRequestWithoutLogin();
      }
    }

    // Closing the Puppeteer controlled headless browser
    await browser.close();
    res.send(innerText);
  });
});


// WIP To Do 
app.post('/api/setThermostatData', checkMyToken, async function(req, res) {
  
  if(req.query.currentSetPoint) {
  // fetch data to login in the API 
    if(!token || !deviceId) {
      await axios.get(`${process.env.HOSTNAME}:${process.env.PORT}/api/fetchThermostatData?token=${process.env.MY_TOKEN}`).then(data => {
        currentSetPoint = data.data.CH1currentSetPoint
        currentRoomTemp = data.data.CH1currentRoomTemp
      })
    }
    await axios.post('https://salus-it500.com/includes/set.php', querystring.stringify({
      'token': token,
      'tempUnit': 0,
      'devId': deviceId,
      'current_tempZ1_set': 1,
      'current_tempZ1': parseFloat(req.query.currentSetPoint)
    }))
    .then(data => {
      if(data.data.retCode === "0" ) {
        res.status(200).send( { currentSetPoint : parseFloat(req.query.currentSetPoint) } )
      } else {
        res.status(404).send( { 'status' : '404', 'message': data.data } )
      }
      
    }).catch(e=> {
      res.status(404).send( { 'status' : 'salus api error' } )
    })
  } else {
    res.status(404).send( { 'status' : 'Please provide currentSetPoint query string!' } )
  }
  
})

app.post('/api/increaseThermostatData', checkMyToken, async function(req, res) {

  let increaseBy = req.query.increaseBy ? parseFloat(req.query.increaseBy) : 0.5; 
  
  let currentRoomTemp, currentSetPoint = '' 

  await axios.get(`${process.env.HOSTNAME}:${process.env.PORT}/api/fetchThermostatData?token=${process.env.MY_TOKEN}`).then(data => {
    currentSetPoint = data.data.CH1currentSetPoint
    currentRoomTemp = data.data.CH1currentRoomTemp
  })

  await axios.post('https://salus-it500.com/includes/set.php', querystring.stringify({
    'token': token,
    'tempUnit': 0,
    'devId': deviceId,
    'current_tempZ1_set': 1,
    'current_tempZ1': parseFloat(currentSetPoint) + increaseBy
  }))
  .then(data => {
    if(data.data.retCode === "0" ) {
      res.status(200).send( { currentSetPoint : parseFloat(currentSetPoint) + parseFloat(increaseBy), currentRoomTemp: currentRoomTemp } )
    } else {
      res.status(404).send( { 'status' : '404', 'message': data.data } )
    }
    
  }).catch(e=> {
    res.status(404).send( { 'status' : 'salus api error' } )
  })

})


app.post('/api/decreaseThermostatData', checkMyToken, async function(req, res) {

  let decreaseBy = req.query.decreaseBy ? parseFloat(req.query.decreaseBy) : 0.5; 
  
  let currentRoomTemp, currentSetPoint = '' 

  await axios.get(`${process.env.HOSTNAME}:${process.env.PORT}/api/fetchThermostatData?token=${process.env.MY_TOKEN}`).then(data => {
    currentSetPoint = data.data.CH1currentSetPoint
    currentRoomTemp = data.data.CH1currentRoomTemp
  })

  await axios.post('https://salus-it500.com/includes/set.php', querystring.stringify({
    'token': token,
    'tempUnit': 0,
    'devId': deviceId,
    'current_tempZ1_set': 1,
    'current_tempZ1': parseFloat(currentSetPoint) - decreaseBy
  }))
  .then(data => {
    if(data.data.retCode === "0" ) {
      res.status(200).send( { currentSetPoint : parseFloat(currentSetPoint) - parseFloat(decreaseBy), currentRoomTemp: currentRoomTemp } )
    } else {
      res.status(404).send( { 'status' : '404', 'message': data.data } )
    }
    
  }).catch(e=> {
    res.status(404).send( { 'status' : 'salus api error' } )
  })

})

// Making Express listen on port
app.listen(process.env.PORT, function () {
  console.log(`Running on port ${process.env.PORT}.`);
});