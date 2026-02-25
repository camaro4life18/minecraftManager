import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Minecraft Server Manager API',
      version: '1.0.0',
      description: 'API for managing Minecraft servers on Proxmox',
      contact: {
        name: 'API Support',
        email: 'support@example.com'
      }
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            username: { type: 'string' },
            email: { type: 'string' },
            role: { type: 'string', enum: ['admin', 'user'] },
            created_at: { type: 'string', format: 'date-time' },
            last_login: { type: 'string', format: 'date-time' }
          }
        },
        Server: {
          type: 'object',
          properties: {
            vmid: { type: 'integer' },
            name: { type: 'string' },
            status: { type: 'string' },
            node: { type: 'string' },
            maxmem: { type: 'integer' },
            maxdisk: { type: 'integer' },
            cpus: { type: 'integer' },
            creator_id: { type: 'integer' },
            seed: { type: 'string' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        LoginRequest: {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: { type: 'string' },
            password: { type: 'string' }
          }
        },
        LoginResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            token: { type: 'string' },
            user: { $ref: '#/components/schemas/User' }
          }
        },
        CloneRequest: {
          type: 'object',
          required: ['sourceVmId', 'newVmId', 'newName'],
          properties: {
            sourceVmId: { type: 'integer' },
            newVmId: { type: 'integer' },
            newName: { type: 'string' },
            seed: { type: 'string' },
            useRandomSeed: { type: 'boolean' }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: ['./server.js'] // Path to the API docs
};

export const swaggerSpec = swaggerJsdoc(options);
