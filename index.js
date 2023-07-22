const express = require('express');
const supabase = require('@supabase/supabase-js');
const app = express();
const port = 3000;

const options = {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  }
}
const client = supabase.createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, options);

app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', async (req, res) => {
  res.render('pages/index');
  const { data, error } = await client.auth.getSession();
  console.log(data, error);
});

app.get('/login', (req, res) => {
  res.render('pages/login');
});

app.post('/login', async (req, res) => {
  try {
    let { data, error } = await client.auth.signInWithPassword({
      email: req.body.email,
      password: req.body.password,
    });
  } catch (err) {
    console.log('Error authenticating');
  }
  res.render('pages/index');
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

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});