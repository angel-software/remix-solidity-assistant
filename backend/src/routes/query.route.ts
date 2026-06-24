import { Router } from 'express';
import { QueryController } from '../controllers/query.controller';

const router: Router = Router();
const queryController: QueryController = new QueryController();

router.post('/', queryController.handleQuery);

export default router;
