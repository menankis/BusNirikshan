const swaggerAutogen = require('swagger-autogen')({ openapi: '3.0.0' });

const doc = {
  info: {
    title: 'BusNirikshan API',
    description: 'Auto-generated API documentation for the BusNirikshan project',
  },
  servers: [
    {
      url: 'https://busnirikshanapi.mauliksharma.org',
      description: 'Production server'
    }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'Enter your bearer token'
      }
    }
  }
};

const outputFile = './swagger-output.json';
// Point to the root file where routes are registered (server.js)
const endpointsFiles = ['./server.js'];

// Generate swagger-output.json
swaggerAutogen(outputFile, endpointsFiles, doc).then(() => {
    console.log("Swagger documentation has been generated successfully.");
});
