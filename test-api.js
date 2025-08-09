// Using built-in fetch in Node.js 18+

async function testAPI() {
  try {
    // Test registration
    console.log('Testing registration...');
    const registerResponse = await fetch('http://localhost:3001/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User'
      })
    });
    
    const registerData = await registerResponse.text();
    console.log('Register status:', registerResponse.status);
    console.log('Register response:', registerData);
    
    if (registerResponse.status === 201 || registerResponse.status === 409) {
      // Login to get token
      console.log('\nTesting login...');
      const loginResponse = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123'
        })
      });
      
      const loginData = await loginResponse.text();
      console.log('Login status:', loginResponse.status);
      console.log('Login response:', loginData);
      
      if (loginResponse.status === 200) {
        const loginJson = JSON.parse(loginData);
        const token = loginJson.token;
        
        // Test SSL certificates endpoint with token
        console.log('\nTesting SSL certificates endpoint...');
        const sslResponse = await fetch('http://localhost:3001/api/ssl/certificates', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        const sslData = await sslResponse.text();
        console.log('SSL status:', sslResponse.status);
        console.log('SSL response:', sslData);
        
        // Test proxies endpoint
        console.log('\nTesting proxies endpoint...');
        const proxiesResponse = await fetch('http://localhost:3001/api/proxies', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        const proxiesData = await proxiesResponse.text();
        console.log('Proxies status:', proxiesResponse.status);
        console.log('Proxies response:', proxiesData);
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testAPI();