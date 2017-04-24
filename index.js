
var express = require('express');
var bodyParser = require('body-parser');
var passport = require('passport');
var cookieSession = require('cookie-session');

var FacebookStrategy = require('passport-facebook').Strategy;
var graph = require('fbgraph');


var request = require('request');


// modelos
var User = require('./models/user');

// configuraciones
const configAuth   = require('./config/variables'); 
const APP_TOKEN = configAuth.APP_TOKEN; 


var app = express();



// 2 formas en que usuario manda informacion json o urlencoded
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));


app.use(cookieSession({ keys: ['asfs', 'fdfdddfddfasf'] }));


app.use(passport.initialize());
app.use(passport.session());

//  motor de vistas pug
app.set('view engine', 'pug');


app.listen(3000, function(){
	console.log('Corriendo servidor puerto 3000...');
});



/** =========================
	Configuraciones de autenticacion
========================= */
passport.use(new FacebookStrategy( {
        clientID        : configAuth.FacebookAuth.clientID,
        clientSecret    : configAuth.FacebookAuth.clientSecret,
        callbackURL     : configAuth.FacebookAuth.callbackURL

    }, function(accessToken, refreshToken, profile, callback){
		

		//finnOrCreate busca y regresa sino existe
		User.findOrCreate({uid: profile.id, provider:'facebook'},
			// sino 
			{
				name: profile.displayName,
				provider: 'facebook',
				accessToken: accessToken,

			}, function(err, user){
				// pasamos usuario del perfil
				callback(null, user);
			}
		);



	}
));

/** Recibimos user de 		callback(null, user);

Serializador y desarializador de peticiones HTTP
*/
passport.serializeUser(function(user, done){
	done(null, user);
});

passport.deserializeUser(function(user, done){
	done(null, user);
});


// Boton en vista:   a(href="/auth/fecebook") para Iniciar sesion FB
app.get('/auth/facebook', 
	
	/* funcion a redirigir a FB autenticacion

	ademas pido permiso para publicar     en scope: ...
	*/
	passport.authenticate('facebook', {scope:['publish_actions','user_friends']})
);

/* =======================================
Funcion llamada en:

passport.use(new FacebookStrategy({
		...
		callbackURL: 'http://localhost:3000/auth/facebook/callback'
======================================= */
app.get('/auth/facebook/callback', 
	passport.authenticate('facebook', {
		failureRedirect: '/'
	}),

	//funcion propia
	function(req, res){
		res.redirect('/');
	}
);

app.get('/auth/close', function(req, res){
	req.logout();
	res.redirect('/');
});

// rutas
app.get('/', function(req, res){

	// usuario no ha iniciado sesion
	if(typeof req.session.passport == "undefined" || !req.session.passport.user ){
		res.render('index');
	
	//	usuario ya inicio sesion
	}else{

		// evitar dobles pulsaciones al momento de ciclar publicacion, cremaos en DB campo publishCyclic
		var user = getUserUID(req.session.passport.user.uid);

		//res.render('home', );
		res.render('home', { activaCheck: user.publishCyclic });

	}

});

var refreshIntervalId;

/* RUTA para que usuario publique a su muro agregando la pagina yamblet */
app.post('/idea', function(req, res){

	var ideaCliente = req.body.ideaCliente;
	var checkCadaMin = req.body.checkCadaMin;

	var user = getUserUID(req.session.passport.user.uid);

	if( checkCadaMin ){

		if (user.publishCyclic ){
			console.log("ya estaba en true (publicacion ciclica)");
		}else{
			persistenciaCheck(user.uid, checkCadaMin);
	
			refreshIntervalId = setInterval( function(){
				console.log('cyclic-publicando...');

				graph.setAccessToken(req.session.passport.user.accessToken);

				graph.post("/feed", {message: "Publicaciòn de prueba automatizada..."}, function(err, graphResponse){
					// regresa el Id de la publicacion
					console.log("respuesta de FB: ", graphResponse);
				});


			}, 10000);	
			//console.log("refreshIntervalId", refreshIntervalId);		
		}
	}else{

		clearInterval(refreshIntervalId);
		console.log('cyclic-publicando... STOP');
		//console.log("refreshIntervalId", refreshIntervalId);		
		persistenciaCheck(user.uid, checkCadaMin);
	}

	if( ideaCliente ){
		console.log("graph.setAccessToken: ", req.session.passport.user.accessToken);
		graph.setAccessToken(req.session.passport.user.accessToken);

		graph.post("/feed", {message: ideaCliente}, function(err, graphResponse){
			// regresa el Id de la publicacion
			console.log("respuesta de FB: ", graphResponse);
			res.redirect("/");
		});
	}

});


/** ==================================================================
   Funciones que deben ir en controlador, por simpiicidad se dejan aqui
================================================================== */
function persistenciaCheck(uid, valor){

	User.findOneAndUpdate( { uid : uid }, {publishCyclic:valor}, (err, user) => {
		if(err){
			console.log("persistencia publishCyclic error");      
		}else{
			console.log("persistencia publishCyclic exitoso");      
		}
	});
}

function getUserUID(suUID){
	return User.findOne({ uid : suUID });
}
/* ==========   Funciones que deben ir en controlador, por simpiicidad se dejan aqui ==========*/



app.get('/friends', function(req, res){


	// podemos usar middleware que revise que este el usuario autenticado ya, user tiene sesion activa
	if(req.session.passport.user.uid ){

		graph.setAccessToken(req.session.passport.user.accessToken);

		/** Hacemos peticion a API graph para obtener amigos en comun que este tambien en el sistema
		llegara en data:  graphResponse		*/
		graph.get("/me/friends", function(err, graphResponse){
		
			// regresa el Id de la publicacion
			//console.log("respuesta de FB: ", graphResponse);

			var ids_contactos = graphResponse.data.map(function(item){
				return item.id;
			});

			User.find({
				'uid':{	$in: ids_contactos } 
			}, function(err, users_devueltos_find){
					res.render('friends', {users:users_devueltos_find});
				}
			);

		});
	
	}

});





/** ===============================
	Messsage 
=============================== */


// Validas webhook
/* For Facebook Validation */
app.get('/webhook', (req, res) => {
	console.log("req.query:", req.query);

	// para que FB sepa que es mi servidor
	// challenge entre FB y yo
  if (req.query['hub.mode'] && req.query['hub.verify_token'] === 'verify_identificador_FB_y_richi') {
    res.status(200).send(req.query['hub.challenge']);
  } else {
  	console.log("Failure challenge");
    res.status(403).end();
  }
});



/** Validas eventos
 *  POST handler to send and receive messages
 */ 
app.post('/webhook', (req, res) => {
  
  var data = req.body;
  console.log(data);

  if (data.object === 'page') {
    
    data.entry.forEach((pageEntry) => {
      pageEntry.messaging.forEach((event) => {
        if (event.message && event.message.text) {
        	console.log("event:", event);

          // preguntamos si es tipo message
          if(event.message){
          	recibeMensaje(event);
          }

        }
      });
    });

    res.status(200).end();
  }

});


function recibeMensaje(event){

	var senderID = event.sender.id;
	var messageText = event.message.text;

	evaluateMessage(senderID, messageText);
}


function evaluateMessage(recipientID, message){

	var finalMessage = '';
	
	if( isContain(message, 'ejemplo') || isContain(message, 'diseño') || isContain(message, 'pagina') || isContain(message, 'url') ){
		//sendMessageImage(recipientID, finalMessage.toLowerCase());
		sendMessageTemplate(recipientID);

	//enviamos un ejemplo
	}else if( isContain(message, 'inform') || isContain(message, 'ayuda') || isContain(message, 'costo') ){

		finalMessage = "En seguida lo contactaremos, si gusta dejar mas informacion.";	
	}else{
		finalMessage = "Por el momento no nos encontramos, le regresamos el mensaje en minutos.";
	}

	sendMessageText(recipientID, finalMessage.toLowerCase());
}

function sendMessageText(recipientId, messageText){
	var messageData = {
		recipient : {
			id : recipientId
		},
		message: {
			text: messageText
		}
	};

	callSendAPI(messageData);
}


function sendMessageImage(recipientID, messageImage){
	var messageData = {
		recipient : {
			id : recipientID
		},
		message: {
			attachment: {
				type: "image",
				payload: {
					url: "https://pbs.twimg.com/profile_images/542070090649198592/tjl44Cvt.png"
				}
			}
		}
	};

	callSendAPI(messageData);
}

function sendMessageTemplate(recipientID){
	var messageData = {
		recipient : {
			id : recipientID
		},
		message: {
			attachment: {
				type: "template",
				payload: {
					template_type: "generic",
					elements: [elementsTemplate()] 
				}
			}
		}
	};

	callSendAPI(messageData);
}

//regresara un elemento
function elementsTemplate(){
	return {
		title: "Empresa Yamblet",
		subtitle: "Desarrollo, orientacion de App y computacion en la nube",
		item_url: "http://yamblet.com",
		image_url: "https://pbs.twimg.com/profile_images/542070090649198592/tjl44Cvt.png",
		buttons: [buttomTemplate()], // botones necesarios   , ..-(), ...()

	}
}
function buttomTemplate(){
	return{
		type: "web_url",
		url: "http://yamblet.com",
		title: "Empresa Yamblet"
	}
}

function isContain(sentence, word){
	return sentence.indexOf(word) > -1;
}


function callSendAPI(messageData){

	request({
		uri: 'https://graph.facebook.com/v2.6/me/messages',
		qs: {access_token: APP_TOKEN},
		method: 'POST',
		json: messageData
	}, function(error, response, body){
    if (!error && response.statusCode == 200) {
      var recipientId = body.recipient_id;
      var messageId = body.message_id;

      console.log("Successfully sent generic message with id %s to recipient %s", messageId, recipientId);
    } else {
      console.error("Unable to send message.");
    }
	})
}






/** 
Usamos ngrok.com para exponer un https  (security)

linux> ./ngrok http 3000
(ejecutar .exe) windows> ngrok http 3000


-- revisar: http://3c3f799e.ngrok.io/webhook


Ejecutar > node index.js 
*/