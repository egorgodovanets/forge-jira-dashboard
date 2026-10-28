import Resolver from '@forge/resolver';
import { sql } from '@forge/sql';

const resolver = new Resolver();

resolver.define('getText', (req) => {
    console.log(req);

    return 'Hello world!';
});

resolver.define('getProductsCount', async () => {
    const result = await sql
        .prepare(`SELECT COUNT(*) AS total FROM products`)
        .execute();
    
    return Number(result.rows[0].total)
})

export const handler = resolver.getDefinitions();

