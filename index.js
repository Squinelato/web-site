var http = require('http'),
    express = require('express'),
    session = require('express-session'),
    path = require('path'),
    client = require('mongodb').MongoClient,
    multer = require('multer'),
    {check, validationResult} = require('express-validator'),
    bodyParser = require('body-parser'),
    mongoose = require('mongoose'),
    GridFsStorage = require('multer-gridfs-storage'),
    Grid = require('gridfs-stream');

var app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({extended: false}));
app.use(bodyParser.json());
app.use(session({
    secret: 'projeto de web',
    resave: false,
    saveUninitialized: true,
    cookie: {secure: false}
}));

url = 'mongodb://localhost:27017/RedHatClone'

const connMongoose = mongoose.createConnection(url, { useNewUrlParser: true });

// Init gfs
let gfs;

connMongoose.once('open', () => {
    // Init stream
    gfs = Grid(connMongoose.db, mongoose.mongo);  
    gfs.collection('uploads');
  });

// Create storage engine
const storage = new GridFsStorage({
    url: url,
    file: (req, file) => {
      return new Promise((resolve, reject) => {
          const filename = file.originalname;
          const fileInfo = {
            filename: filename,
            bucketName: 'uploads'
          };
          resolve(fileInfo);
      });
    }
  });
  
const upload = multer({ storage });

//==================================================================================================================

//USERS
async function getUser(login){
    let conn = await client.connect(url, {useNewUrlParser: true, useUnifiedTopology: true});
    let db = conn.db('RedHatClone');
    return await db.collection('users').find({email: login}).toArray()
}

//CONTENT
async function getContent(title){
    let conn = await client.connect(url,{useNewUrlParser: true, useUnifiedTopology: true});
    let db = conn.db('RedHatClone');
    if(title == "")
        return await db.collection('content').find({}).toArray()
    else
        return await db.collection('content').find({title: new RegExp(".*"+title+".*")}).toArray()
}

async function insertData(data, collection_name){
    let conn = await client.connect(url, { useNewUrlParser: true, useUnifiedTopology: true });
    let db = conn.db('RedHatClone');
    return await db.collection(collection_name).insertOne(data)
}

//==================================================================================================================

app.get('/', async (req, res, next) =>{
    let content = await getContent("");
    if(req.session && req.session.login){
        res.render("redhat", {content: content, adm: true});
    }else{
        res.render("redhat", {content: content, adm: false});
    }
});

//==================================================================================================================

app.get('/refresh', async (req, res) => {
    res.send(await getContent(""));
});

//==================================================================================================================

app.post('/update', async (req, res) => {
    var data = {user: req.session.login == null? 'guest': req.session.login , visits: req.body.currentDate};
    await insertData(data, 'activity');
})

//==================================================================================================================

app.get('/search', async (req, res) => {
    if (req.query.value != ''){
        console.log(req.query.value);
        var result = await getContent(req.query.value);
        res.send(result);
    } else {
        res.send({title: ''});
    }
});

app.get('/login', (req, res) =>{
    res.render("login");
    if(req.session && req.session.login){
        res.end("" + req.session.login + " Logado!");
    }
});

app.post('/login',[
    check('username').isEmail().withMessage('O e-mail inserido é inválido'),
    check('password').isLength( { min: 1} ).withMessage('Campo senha vazio')
], async (req, res) => {

    let login = req.body.username,
        password = req.body.password;
    
    const errors = validationResult(req);
    
    //login
    let isThere =  await getUser(login);
    
    if(isThere[0] != undefined){
        if( isThere[0].password == password){
            req.session.login = isThere[0].email;
            res.redirect("/");
            return;
        }
    }
    errors.errors.push({msg: "Login ou senha errados"});
    res.render("login",{success: false, errors: errors.errors});
});

//==================================================================================================================

app.get('/buscar', async (req, res) => {
    res.render('busca');
})
app.get('/resultado', async (req, res) => {
    let con = await getContent(req.query.info);
    if(req.session && req.session.login){
        res.render('redhat', {adm: true, content: con});
    }else{
        res.render('redhat', {adm: false, content: con});
    }
});

//==================================================================================================================

app.get('/AddCont', (req, res) => {
    if(req.session && req.session.login) {
        res.render('post_content', {forbiden: false});
    } else {
        res.render('post_content', {forbiden: true});
    }
})

app.post('/AddCont', upload.single('arquivo'), [
    check('contenttitle').isLength({ max: 50, min: 1}).withMessage('O título deve conter no mínimo 1 caracter e no máximo 50'),
    check('contenttext').isLength({min: 1}).withMessage('O conteúdo deve conter ao menos 1 caracter'),
    check('contentbutom').isLength({ max: 25, min: 1 }).withMessage('O texto do botão deve ter ao menos 1 caracter e ser menor que 25 caracteres')
], async (req, res) => {

    const errors = validationResult(req);

    if (!errors.isEmpty()) { 
        res.render('post_content', {success: false, errors: errors.errors});
    } else {
        res.render('post_content', {success: true});

        let title = req.body.contenttitle;
        let content = req.body.contenttext;
        let buttom_content = req.body.contentbutom;
        let file_name = req.file.filename;

        let user = await getUser(req.session.login);
        let user_name = user[0].name;

        let data = {
            "title": title,
            "body": content,
            "btn": buttom_content,
            "img": '/image/' + file_name,
            "User": user_name,
            "date": new Date()
        };

        await insertData(data, 'content');
        
    }
});

app.get('/image/:filename', (req, res) => {

    gfs.files.findOne({ filename: req.params.filename }, (err, file) => {
      // Checa de a entrada é válida ou não
      if (!file || file.length === 0) {
        return res.status(404).json({
          err: 'Arquivo não existe'
        });
      }
  
      // Se o arquivo existe, então checa de o arquivo é uma image
      if (file.contentType === 'image/jpeg' || file.contentType === 'image/png') {
        // lendo a saída no browser
        const readstream = gfs.createReadStream(file.filename);
        readstream.pipe(res);
      } else {
        res.status(404).json({
          err: 'Não é uma imagem'
        });
      }
    });
  });

//==================================================================================================================

app.get('/sign_up', (req, res) => {
    res.render('form', {success: false, errors: []});
})

app.post('/sign_up', [
    check('username').isLength( { min: 1} ).withMessage('Campo nome vazio'),
    check('userlastname').isLength( { min: 1} ).withMessage('Campo sobrenome vazio'),
    check('userbirthday').matches(/^\d\d\/\d\d\/\d\d\d\d$/i).withMessage('A data de nascimento deve estar no formato "dd/mm/aaaa"'),
    check('useremail').isEmail().withMessage('O email inserido é inválido'),
    check('userstreet').isLength( { min: 1} ).withMessage('Campo nome da rua vazio'),
    check('userstreetnumber').matches(/^\d+$/i).withMessage('O número da rua deve conter apenas dígitos'),
    check('usercomplement').isLength( { min: 1} ).withMessage('Campo complemento vazio'),
    check('userregion').isLength( { min: 1} ).withMessage('Campo bairro vazio'),
    check('usercity').isLength( { min: 1} ).withMessage('Campo cidade vazio'),
    check('userfederation').isLength( { min: 1} ).withMessage('Campo estado vazio'),
    check('userpassword').isLength({ min: 5 }).withMessage('A senha dever ter, ao menos, 5 caracteres')
    ], async (req, res) => {

        const errors = validationResult(req);
        let hasEmail = await getUser(req.body.useremail) 

        if (hasEmail.length > 0){
            errors.errors.push({'msg': 'e-mail já cadastrado!'})
        }

        if (!errors.isEmpty()) { 
            res.render('form', {success: false, errors: errors.errors});
        } else {
            res.render('form', {success: true});

            let name = req.body.username;
            let lastName = req.body.userlastname;
            let birthday = req.body.userbirthday;
            let email = req.body.useremail;
            let street = req.body.userstreet;
            let streetNumber = req.body.userstreetnumber;
            let complement = req.body.usercomplement;
            let region = req.body.userregion;
            let city = req.body.usercity;
            let federation = req.body.userfederation;
            let password = req.body.userpassword;

            let data = {
                "name": name,
                "last_name": lastName,
                "birth_day": birthday,
                "email": email,
                "address": {
                    "street": street,
                    "street_number": streetNumber,
                    "complement": complement,
                    "region": region,
                    "city": city,
                    "federation": federation,
                },
                "password": password
            };

            await insertData(data, 'users');

            res.redirect('/login');
        }

});

http.createServer(app).listen(process.env.PORT || 8001);
