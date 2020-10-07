const dotenv = require('dotenv');
dotenv.config();
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer');
const express = require('express');
const app = express(); // Initializing Express
const HOSTNAME = process.env.APP_ENV === "local" ? `${process.env.DEV_HOSTNAME}:${process.env.PORT}` : process.env.FIREBASE_HOSTNAME; 
const USERNAME_SELECTOR = '#login_form > input[type=text]:nth-child(1)';
const PASSWORD_SELECTOR = '#login_form > input[type=password]:nth-child(3)';
const DEVICE_SELECTOR = 'a.deviceIcon.online';
const CTA_SELECTOR = '#login';
const CTA_LOGOUT = '#navBar > li:nth-child(4) > a';
const SALUS_SET_URL = process.env.SALUS_SET_URL;
const axios = require('axios').default;
var token =  null;
var deviceId =  null;
var innerText = null; 
var querystring = require('querystring');
app.use(bodyParser.urlencoded({ extended: true }))

// parse application/json
app.use(bodyParser.json())

function generateRequestUrl(){
  return token ? `https://salus-it500.com/public/ajax_device_values.php?devId=${deviceId}&token=${token}&_=${Date.now()}`: null;
}

const makeRequestWithoutLogin =  async() => {

  let api_url = generateRequestUrl()
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

const  checkIfRequestIsValid = (data) =>{
  if(data.CH1currentRoomTemp === "32.0" && data.CH1currentSetPoint === "32.0" && data.CH1autoOff === "") {
    return false
  }
  return true
}

const login = async () => {

    const browser = await puppeteer.launch({
      executablePath: 'chromium-browser',
      headless: true,
      args: ['--no-sandbox']
    });

    const page = await browser.newPage();
    await page.goto(process.env.WEBSITE);
    await page.click(USERNAME_SELECTOR);
    await page.keyboard.type(process.env.EMAIL);
    await page.click(PASSWORD_SELECTOR);
    await page.keyboard.type(process.env.PASSWORD);
    await page.click(CTA_SELECTOR);
    await page.waitForNavigation();
    //await page.screenshot({path: 'salus.png'});
    await page.click(DEVICE_SELECTOR);
    await page.waitForSelector('#TabbedPanels1', {
      visible: true,
    });
    let devId = await page.$('#devId');
    deviceId = await page.evaluate(devId => devId.value, devId);
    let tk = await page.$('#token');
    token = await page.evaluate(tk => tk.value, tk);
    await page.click(CTA_LOGOUT);
    //await page.screenshot({path: 'salus.png'});

    // Closing the Puppeteer controlled headless browser
    await browser.close();
  
}

// token middleware all web endpoints
app.use('/', (req, res, next) => {
  if(process.env.MY_TOKEN === req.query.token) {
    return next();
  } 
  return res.status(401).send({'status' : 401 , 'message': 'unauthorized'})
})

app.get('/', (req, res) =>
  res.status(200).json({'status': 200})
)

app.get('/api/fetchThermostatData', async (req, res) =>{

  innerText = await makeRequestWithoutLogin();

  if(!innerText) {
    // make request with login 
    await login()
    innerText = await makeRequestWithoutLogin();

  } 
  else {

    if(!checkIfRequestIsValid(innerText)) {
      // make request with login 
      await login()
      innerText = await makeRequestWithoutLogin();
    }
  }

  return res.send(innerText);
})

app.post('/api/setThermostatData', async (req, res) => {
  
  if(req.query.currentSetPoint) {
  // fetch data to login in the API 
    if(!token || !deviceId) {
      await axios.get(`${HOSTNAME}/api/fetchThermostatData?token=${process.env.MY_TOKEN}`).then(data => {
        currentSetPoint = data.data.CH1currentSetPoint
        currentRoomTemp = data.data.CH1currentRoomTemp
      }).catch((e) => {
        return res.status(404).send( { 'status' : '404', 'message': 'fetch error' } )
      })
    }
    await axios.post(SALUS_SET_URL, querystring.stringify({
      'token': token,
      'tempUnit': 0,
      'devId': deviceId,
      'current_tempZ1_set': 1,
      'current_tempZ1': parseFloat(req.query.currentSetPoint)
    }))
    .then(data => {
      if(data.data.retCode === "0" ) {
        res.status(200).send( { status: '200', currentSetPoint : parseFloat(req.query.currentSetPoint) } )
      } else {
        res.status(404).send( { 'status' : '404', 'message': data.data } )
      }
      
    }).catch(e=> {
      return res.status(404).send( { 'status' : 'salus api error' } )
    })
  } else {
    return res.status(404).send( { 'status' : 'Please provide currentSetPoint query string!' } )
  }
})

app.post('/api/setThermostatDataMode', async (req, res) => {
  
  if(req.query.mode) {

    let mode = parseInt(req.query.mode)
    // mode can be 
    // schedule : 0, 
    // off : 1
    // manual : 2

  // fetch data to login in the API 
    if(!token || !deviceId) {
      await axios.get(`${HOSTNAME}/api/fetchThermostatData?token=${process.env.MY_TOKEN}`).then(data => {
        currentSetPoint = data.data.CH1currentSetPoint
        currentRoomTemp = data.data.CH1currentRoomTemp
      }).catch((e) => {
        return res.status(404).send( { 'status' : '404', 'message': 'fetch error' } )
      })
    }

    if(mode === 0 || mode === 1) {
        queryData = {
        'token': token,
        'auto': mode,
        'devId': deviceId,
        'auto_setZ1': 1,
      }
    } 

    // WIP - doesn`t work like that 
  
    // else if(mode === 2 ) {
    //   queryData = {
    //     'token': token,
    //     'manual': mode,
    //     'devId': deviceId,
    //     'manual_setZ1': 1,
    //   }
    // }
    
    await axios.post(SALUS_SET_URL, querystring.stringify(queryData))
    .then(data => {
      if(data.data === "1" ) {
        res.status(200).send( { 'status' : 'mode updated', mode } )
      } else {
        res.status(404).send( { 'status' : '404', 'message': data.data } )
      }
      
    }).catch(e=> {
      res.status(404).send( { 'status' : 'salus api error' } )
    })
  } else {
    res.status(404).send( { 'status' : 'Please provide mode query string! (0 - schedule , 1 -  off)' } )
  }
  
})


app.post('/api/increaseThermostatData', async (req, res) => {

  let increaseBy = req.query.increaseBy ? parseFloat(req.query.increaseBy) : 0.5; 
  
  let currentRoomTemp, currentSetPoint = '' 

  await axios.get(`${HOSTNAME}/api/fetchThermostatData?token=${process.env.MY_TOKEN}`).then(data => {
    currentSetPoint = data.data.CH1currentSetPoint
    currentRoomTemp = data.data.CH1currentRoomTemp
  }).catch( (e) => {
    return res.status(404).send( { 'status' : '404', 'message': 'fetch error' } )
  })
  await axios.post(SALUS_SET_URL, querystring.stringify({
    'token': token,
    'tempUnit': 0,
    'devId': deviceId,
    'current_tempZ1_set': 1,
    'current_tempZ1': parseFloat(currentSetPoint) + increaseBy
  }))
  .then(data => {
    if(data.data.retCode === "0" ) {
      return res.status(200).send( { currentSetPoint : parseFloat(currentSetPoint) + parseFloat(increaseBy), currentRoomTemp: currentRoomTemp } )
    } else {
      return res.status(404).send( { 'status' : '404', 'message': data.data } )
    }
    
  }).catch(e=> {
    return res.status(404).send( { 'status' : 'salus api error' } )
  })

})


app.post('/api/decreaseThermostatData', async (req, res) => {

  let decreaseBy = req.query.decreaseBy ? parseFloat(req.query.decreaseBy) : 0.5; 
  
  let currentRoomTemp, currentSetPoint = '' 

  await axios.get(`${HOSTNAME}/api/fetchThermostatData?token=${process.env.MY_TOKEN}`).then(data => {
    currentSetPoint = data.data.CH1currentSetPoint
    currentRoomTemp = data.data.CH1currentRoomTemp
  }).catch( (e) => {
    return res.status(404).send( { 'status' : '404', 'message': 'fetch error' } )
  })
  await axios.post(SALUS_SET_URL, querystring.stringify({
    'token': token,
    'tempUnit': 0,
    'devId': deviceId,
    'current_tempZ1_set': 1,
    'current_tempZ1': parseFloat(currentSetPoint) - decreaseBy
  }))
  .then(data => {
    if(data.data.retCode === "0" ) {
      return res.status(200).send( { currentSetPoint : parseFloat(currentSetPoint) - parseFloat(decreaseBy), currentRoomTemp: currentRoomTemp } )
    } else {
      return res.status(404).send( { 'status' : '404', 'message': data.data } )
    }
    
  }).catch(e=> {
    return res.status(404).send( { 'status' : 'salus api error' } )
  })

})

// Making Express listen on port
app.listen(process.env.PORT, function () {
  console.log(`Running on port ${process.env.PORT}.`);
});