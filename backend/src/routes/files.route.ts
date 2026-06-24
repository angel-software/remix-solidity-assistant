import { Router } from 'express';
import { FilesController } from '../controllers/files.controller';

const router: Router = Router();
const filesController: FilesController = new FilesController();

router.post('/', filesController.handleFiles);

export default router;
