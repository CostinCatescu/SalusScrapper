module.exports = function checkMyToken(req, res, next){
  if(process.env.MY_TOKEN === req.query.token) {
    return next();
  }
  return res.status(401).send({'status' : 401 , 'message': 'unauthorized'})
}

