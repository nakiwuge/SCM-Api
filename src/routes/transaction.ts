import { Router }  from 'express';
import Transaction from '../controllers/transaction';
import verifyToken from '../middlewares/verifyToken'
import {isPermitted} from '../middlewares/role'

const router = Router();
const { getUserTransactions, addTransaction, getTransactions,deleteTransaction, undoTransaction } = Transaction;

router.get('/transactions/:userId',verifyToken,getUserTransactions);
router.get('/admin/transactions',verifyToken,isPermitted(['admin','superAdmin']),getTransactions);
router.post('/transactions',verifyToken,isPermitted(['admin','superAdmin','treasurer']), addTransaction);
router.delete('/transactions/:id',verifyToken,isPermitted(['admin','superAdmin','treasurer']), deleteTransaction);
router.put('/transactions/:id',verifyToken,isPermitted(['admin','superAdmin','treasurer']), undoTransaction);

export default router;
