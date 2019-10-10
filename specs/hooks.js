// eslint-disable-next-line strict
const hooks = require('hooks');

hooks.before('/trigger > Running failover task state > 202 > application/json', (transaction, done) => {
    transaction.skip = true;
    done();
});

hooks.after('/trigger > Running failover task state > 200 > application/json; charset=UTF-8', (transaction, done) => {
    transaction.skip = true;
    done();
});

hooks.after('/trigger > Running failover task state > 400 > application/json; charset=UTF-8', (transaction, done) => {
    transaction.skip = true;
    done();
});
