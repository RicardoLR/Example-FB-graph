
var mongoose = require('../connections/mongoose');

var findOrCreate = require('mongoose-findorcreate');


// para mi ESQUEMA
var Schema = mongoose.Schema;

var userSchema = new Schema({
	name : {type : String},
	provider : {type: String},
	uid : {type: String},
	accessToken : {type: String},

	publishCyclic : {type: Boolean}
});


userSchema.plugin(findOrCreate);


// para mi MODELO
// miMondoose.model(Collection, mySchema)
var UserModel = mongoose.model('User', userSchema);

module.exports = UserModel;