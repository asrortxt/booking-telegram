import { route, login } from '../../lib/http.js';

export default route({
  POST: async (req, res) => { res.status(200).json({ token: login(req.body?.password) }); },
});
