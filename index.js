require('dotenv').config()
const express = require('express');
const paypal = require('./paypal.js');
const supabase = require('@supabase/supabase-js');
const app = express();
const port = 3000;

const options = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false
  }
}
const client = supabase.createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, options);

const retrieveSession = async (req, res, next) => {
  const { data, error } = await client.auth.getSession();
  if (data.session) {
    res.locals.session = data.session.user.user_metadata;
  } else {
    res.locals.session = null;
  }
  req.session = data.session;
  next();
}

app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(retrieveSession);

app.get('/', async (req, res) => {
  res.render('pages/index');
});

app.get('/login', async (req, res) => {
  if (req.session) {
    res.redirect('/');
  } else {
    res.render('pages/login');
  }
});

app.post('/login', async (req, res) => {
  let { data: signInData, err } = await client.auth.signInWithPassword({
    email: req.body.email,
    password: req.body.password,
  });

  res.redirect('/');
});

app.get('/logout', async (req, res) => {
  let { error } = await client.auth.signOut();
  res.redirect('/');
});

app.get('/register', (req, res) => {
  res.render('pages/register');
});

app.post('/register', async (req, res) => {
  let { data, error } = await client.auth.signUp(
    {
      email: req.body.email,
      password: req.body.password,
      options: {
        data: {
          username: req.body.username,
        }
      }
    }
  );
  console.log(data);
  res.render('pages/login');
});

app.get('/categories', async (req, res) => {
  let { data: categoryList } = await client.from('category').select('*');
  let { data: products, error } = await client.from('product').select('*');
  res.render('pages/category', { categoryList, products });
});

app.get('/category/:name', async (req, res) => {
  let { data: categoryList, error } = await client.from('category').select('*', { count: 'exact' });
  let { data: currentCategory, categoryError } = await client.from('category').select('display_name').eq('name', req.params.name).limit(1).single();
  let { data: products, productError } = await client.from('product').select('*').eq('category', req.params.name);
  res.render('pages/category', { categoryList, currentCategory, products });
});

app.get('/product/:id', async (req, res) => {
  let { data: product, error } = await client.from('product').select('*').eq('id', req.params.id).limit(1).single();
  res.render('pages/product', { product });
});

app.post('/product/:id', async (req, res) => {
  if (req.session) { 
    let userId = req.session.user.id;
    let productId = req.params.id;
    const { error } = await client.from('cart-item').insert({user_id: userId, product_id: productId});
    res.redirect('/cart');
  } else {
    res.redirect('/login');
  }
});

app.get('/cart', async (req, res) => {
  if (req.session) {
    const { data: cartItems, error } = await client.from('cart-item').select('id, product_id').eq('user_id', req.session.user.id);
    let products = null;
    let total = 0;
    if (cartItems.length > 0) {
      const productIds = cartItems.map(item => item.product_id);
      const { data: productItems, productError } = await client.from('product').select('*').in('id', productIds);

      const productItemDict = productItems.reduce((result, item) => {
        const { id, ...rest } = item;
        result[id] = rest;
        return result;
      }, {});
      
      products = cartItems.map(item => {
        return {cart_item_id: item.id, product_id: item.product_id, ...productItemDict[item.product_id]} 
      });
      total = products.reduce((result, item) => {
        return result + item.price;
      }, 0).toFixed(2);
    }
    res.render('pages/cart', { products, total });
  } else {
    res.redirect('/login');
  }
});

app.post('/cart/:id', async (req, res) => {
  if (req.session) {
    const { error } = await client.from('cart-item').delete().eq('id', req.params.id);
    res.redirect('/cart');
  } else {
    res.redirect('/login');
  }
});

app.post('/checkout', async (req, res) => {
  if (req.session) {
    const order = await paypal.createOrder(200);
    res.json(order);
  } else {
    res.redirect('/login');
  }
});

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});