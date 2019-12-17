import { Router }  from 'express';
import User from '../controllers/user';
import { upload }from '../middlewares/multer';

const router = Router();
const { addUser, verifyUser, sendVerificationCode, updateProfile,setPassword } = User;

router.post('/admin/users', addUser);
router.post('/users/send-code', sendVerificationCode,verifyUser);
router.put('/users/verify', verifyUser);
router.put('/users/profile/:id', upload, updateProfile);
router.put('/users/set-password/:id', setPassword);

export default router;
