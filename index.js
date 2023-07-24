require('dotenv').config()
const express = require('express');
const paypal = require('./paypal.js');
const supabase = require('@supabase/supabase-js');
const app = express();
const port = 80;

const options = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false
  }
}
const client = supabase.createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, options);

const retrieveSession = async () => {
  const { data, error } = await client.auth.getSession();
  if (data.session) {
    return data.session
  } else {
    return null
  }
}

app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', async (req, res) => {
  const session = await retrieveSession();
  if (session) {
    res.locals.session = session.user.user_metadata;
    res.render('pages/index');
  } else {
    res.render('pages/index');
  }
});

app.get('/login', async (req, res) => {
  const session = await retrieveSession();
  if (session) {
    res.locals.session = session.user.user_metadata;
    res.redirect('/');
  } else {
    if (req.query.confirmEmail) {
      res.render('pages/login', { confirmEmail: true });
    } else {
      res.render('pages/login');
    }
  }
});

app.post('/login', async (req, res) => {
  let { data: signInData, error } = await client.auth.signInWithPassword({
    email: req.body.email,
    password: req.body.password,
  });
  
  if (error) {
    res.render('pages/login', { error });
  } else {
    res.redirect('/');
  }
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
  if (error) {
    res.render('pages/register', { error });
  } else {
    res.redirect('/login?confirmEmail=true');
  }
});

app.get('/categories', async (req, res) => {
  const session = await retrieveSession();
  if (session) {
    res.locals.session = session.user.user_metadata;
  }
  let { data: categoryList } = await client.from('category').select('*');
  let { data: products, error } = await client.from('product').select('*');
  res.render('pages/category', { categoryList, products });
});

app.get('/category/:name', async (req, res) => {
  const session = await retrieveSession();
  if (session) {
    res.locals.session = session.user.user_metadata;
  }
  let { data: categoryList, error } = await client.from('category').select('*', { count: 'exact' });
  let { data: currentCategory, categoryError } = await client.from('category').select('display_name').eq('name', req.params.name).limit(1).single();
  let { data: products, productError } = await client.from('product').select('*').eq('category', req.params.name);
  res.render('pages/category', { categoryList, currentCategory, products });
});

app.get('/product/:id', async (req, res) => {
  const session = await retrieveSession();
  if (session) {
    res.locals.session = session.user.user_metadata;
  }
  let { data: product, error } = await client.from('product').select('*').eq('id', req.params.id).limit(1).single();
  res.render('pages/product', { product });
});

app.post('/product/:id', async (req, res) => {
  const session = await retrieveSession();
  if (session) {
    res.locals.session = session.user.user_metadata;
    let userId = session.user.id;
    let productId = req.params.id;
    const { error } = await client.from('cart-item').insert({user_id: userId, product_id: productId});
    res.redirect('/cart');
  } else {
    res.redirect('/login');
  }
});

app.get('/cart', async (req, res) => {
  const session = await retrieveSession();
  if (session) {
    res.locals.session = session.user.user_metadata;
    const { data: cartItems, error } = await client.from('cart-item').select('id, product_id').eq('user_id', session.user.id);
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
  const session = await retrieveSession();
  if (session) {
    res.locals.session = session.user.user_metadata;
    const { error } = await client.from('cart-item').delete().eq('id', req.params.id);
    res.redirect('/cart');
  } else {
    res.redirect('/login');
  }
});

app.post('/checkout', async (req, res) => {
  const session = await retrieveSession();
  if (session) {
    res.locals.session = session.user.user_metadata;
    const { data: cartItems, error } = await client.from('cart-item').select('id, product_id').eq('user_id', session.user.id);
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
      const order = await paypal.createOrder(total);
      res.redirect(order.links.find(link => link.rel === 'approve').href);
    } else {
      res.redirect('/cart');
    }
  } else {
    res.redirect('/login');
  }
});

app.get('/finalizepayment', async (req, res) => {
  // remove items from cart
  const session = await retrieveSession();
  if (session) {
    res.locals.session = session.user.user_metadata;
    let completeOrder = await paypal.completeOrder(req.query.token);
    res.redirect('/checkout');
  } else {
    res.redirect('/login');
  }
});

app.get('/checkout', async (req, res) => {
  const session = await retrieveSession();
  if (session) {
    res.locals.session = session.user.user_metadata;
    const { error } = await client.from('cart-item').delete().eq('user_id', session.user.id);
    res.render('pages/checkout');
  } else {
    res.redirect('/login');
  }
});


app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});