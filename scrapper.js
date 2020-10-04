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

app.use(bodyParser.urlencoded({ extended: false }))
 
// parse application/json
app.use(bodyParser.json())

const checkMyToken = require('./middleware/checkMyToken');

function generateRequestUrl(){
  return token ? `https://salus-it500.com/public/ajax_device_values.php?devId=${deviceId}&token=${token}&_=${Date.now()}`: null;
}

async function makeRequestWithoutLogin(page) {
  let api_url = generateRequestUrl();
  if(api_url) {
    // do API request
    await page.goto(api_url);
    innerText = await page.evaluate(() =>  {
        return JSON.parse(document.querySelector("body").innerText); 
    });
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

    innerText = await makeRequestWithoutLogin(page);

    if(!innerText) {
        // make request with login 
        await login(page)
        innerText = await makeRequestWithoutLogin(page);

    } else {

      if(!checkIfRequestIsValid(innerText)) {
        // make request with login 
        await login(page)
        innerText = await makeRequestWithoutLogin(page);
      }
    }

    // Closing the Puppeteer controlled headless browser
    await browser.close();
    res.send(innerText);
  });
});


// WIP To Do 
app.post('/api/setThermostatData', checkMyToken, function(req, res) {
  
    res.send(req.query)
  
})

// WIP To Do 
app.post('/api/increaseThermostatData', checkMyToken, async function(req, res) {
  
  let currentRoomTemp, currentSetPoint = '' 

  await axios.get(`${process.env.HOSTNAME}:${process.env.PORT}/api/fetchThermostatData?token=${process.env.MY_TOKEN}`).then(data => {
    currentRoomTemp = data.data.CH1currentRoomTemp
    currentSetPoint = data.data.CH1currentSetPoint
  })

  res.status(200).send( { currentRoomTemp : parseFloat(currentSetPoint) + 0.5 } )

})

// WIP To Do 
app.post('/api/decreaseThermostatData', checkMyToken, async function(req, res) {
  
  let currentRoomTemp, currentSetPoint = '' 

  await axios.get(`${process.env.HOSTNAME}:${process.env.PORT}/api/fetchThermostatData?token=${process.env.MY_TOKEN}`).then(data => {
    currentRoomTemp = data.data.CH1currentRoomTemp
    currentSetPoint = data.data.CH1currentSetPoint
  })

  res.status(200).send( { currentRoomTemp : parseFloat(currentSetPoint) - 0.5 } )

})

// Making Express listen on port
app.listen(process.env.PORT, function () {
  console.log(`Running on port ${process.env.PORT}.`);
});