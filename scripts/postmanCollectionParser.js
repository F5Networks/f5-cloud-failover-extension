'use strict';

const fs = require('fs');
const uuidv4 = require('uuid/v4');

const INPUT_FILE = 'examples/generatedPostmanCollection.json';
const OUTPUT_FILE = 'examples/generatedPostmanCollection.json';
const ENVIRONMENTS = ['aws', 'azure', 'gce'];

// Deep copy by converting object to / from JSON
const deepCopy = obj => JSON.parse(JSON.stringify(obj));

// Only need to get the Updates
const environmentRequest = (endpoint, env) => {
    // Clone object, and update endpoint-level properties
    const clonedEndpoint = deepCopy(endpoint);
    clonedEndpoint.id = uuidv4();
    clonedEndpoint.name = `(${env.toUpperCase()}) ${clonedEndpoint.name}`;

    // Update Request level properties
    const requestBody = JSON.parse(clonedEndpoint.request.body.raw);
    requestBody.environment = env;
    clonedEndpoint.request.body.raw = JSON.stringify(requestBody, null, 4);

    // Update Response level properties
    clonedEndpoint.response.forEach((resp) => {
        const responseBody = JSON.parse(resp.originalRequest.body.raw);
        responseBody.environment = env;
        resp.originalRequest.body.raw = JSON.stringify(requestBody, null, 4);
    });

    return clonedEndpoint;
};

// Get '/declare' requests, and remove any duplicate Array objects created by openapi-to-postman
// openapi-to-postman duplicates Array items when it defaults maxItems for JSON Arrays to '2' in:
//      https://github.com/postmanlabs/openapi-to-postman/blob/develop/lib/util.js#L54
const parseDeclareEndpoints = (collection) => {
    let declareFolder;
    collection.item.forEach((item) => {
        if (item.name === 'declare') {
            declareFolder = item;
        }
    });

    // If any Object is an Array, set Array to be only the first object
    const shortenArray = (body) => {
        Object.keys(body).forEach((key) => {
            if (Array.isArray(body[key])) {
                body[key] = [body[key][0]];
            }
        });
        return body;
    };

    declareFolder.item.forEach((item) => {
        if (item.name === 'Update configuration') {
            // Shorten the request
            const requestBody = shortenArray(JSON.parse(item.request.body.raw));
            item.request.body.raw = JSON.stringify(requestBody, null, 4);

            // Shorten the responses
            item.response.forEach((resp) => {
                const responseBody = shortenArray(JSON.parse(resp.originalRequest.body.raw));
                resp.originalRequest.body.raw = JSON.stringify(responseBody, null, 4);
            });
        }
    });

    return declareFolder;
};

// Add the 'examples' subfolder to the '/declare' endpoint
const addExamples = (declareEndpoints) => {
    let exampleUpdateEndpoint;
    declareEndpoints.item.forEach((item) => {
        if (item.name === 'Update configuration') {
            exampleUpdateEndpoint = deepCopy(item);
        }
    });

    const exampleFolder = {
        id: uuidv4(),
        name: 'examples',
        item: [],
        event: []
    };

    ENVIRONMENTS.forEach((env) => {
        const envExample = environmentRequest(exampleUpdateEndpoint, env);
        exampleFolder.item.push(envExample);
    });

    declareEndpoints.item.push(exampleFolder);
    return declareEndpoints;
};

// updateCollection();
const parsedCollection = JSON.parse(fs.readFileSync(INPUT_FILE));
const declareEndpoints = parseDeclareEndpoints(parsedCollection);
parsedCollection.item.forEach((item) => {
    if (item.name === 'declare') {
        item = addExamples(declareEndpoints);
    }
});
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(parsedCollection, null, 4));
