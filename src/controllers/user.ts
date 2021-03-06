/* eslint-disable @typescript-eslint/ban-ts-ignore */
import { Request, Response } from 'express';
import  bcrypt from  'bcrypt';
import Validation from '../helpers/validation';
import { getRole } from '../helpers/role';
import { getPhoneNumber, validatePhoneNumber } from '../helpers/phoneNumber';
import { resHandler } from '../helpers/resHandler';
import { userRequest } from '../interfaces';
import sendCode from '../helpers/sendVerificationCode';
import {generateToken ,decodeToken}from '../helpers/jwtToken'
import dbQuery from '../helpers/queries'
import { getUser } from '../helpers/user';
import { uploader } from '../config/cloudinary';
import { dataUri } from '../middlewares/multer';
import db from '../database/config';

const { isRequired, validatePassword, isEmail } = Validation;
const today = new Date()
/**
 * Handles user CRUD.
 * @class
 *
 * @return {void}
 */

class User {

  /**
 * Handles adding a user.
 * @func addUser
 *
 * @param {object}   req
 *
 * @param {Object}   res
 *
 * @return {Response}
 */
  static async addUser(req: Request,res: Response){
    const { email,phoneNumber,role, accountBalance } = req.body;
    const data = {email, phoneNumber,role,accountBalance };
    const error = await handleChecks(res,data);

    if (error){
      return resHandler(res,false,error);
    }

    const text = 'INSERT INTO users(email,phone_number,role,account_balance) VALUES($1,$2,$3,$4) RETURNING *';
    const values = [email, phoneNumber,role,accountBalance];
    const result = await dbQuery(res,text,values)

    await delete result.password

    return resHandler(res,true,result,201);
  }

  /**
 * Handles getting a user.
 * @func getUser
 *
 * @param {object}   req
 *
 * @param {Object}   res
 *
 * @return {Response}
 */
  static async getUser(req: Request,res: Response){
    const text = `
  SELECT
    users.id id,
    email,
    first_name,
    last_name,
    phone_number,
    is_verified,
    account_balance,
    roles.id role_id,
    roles.name role_name,
    profile_picture,
    users.created_at created_at
    FROM roles INNER JOIN users ON (users.role = roles.id)
    Where users.id=$1
  `

    const values = [req.params.id];
    const result:any = await db.query(text, values)
    const {role_name,role_id, ...rest}=  result.rows[0]
    const userData = {
      ...rest,
      role:{
        id:role_id,
        name:role_name
      }
    }

    return resHandler(res,true,userData,200);
  }

  /**
 * Handles getting a user.
 * @func getUsers
 *
 * @param {object}   req
 *
 * @param {Object}   res
 *
 * @return {Response}
 */
  static async getUsers(req: Request,res: Response){
    const text = `
SELECT
  users.id id,
  email,
  first_name,
  last_name,
  phone_number,
  is_verified,
  account_balance,
  roles.id role_id,
  roles.name role_name,
  profile_picture,
  users.created_at created_at
  FROM roles INNER JOIN users ON (users.role = roles.id) 
`

    const result = await db.query(text)

    return resHandler(res,true,result.rows,200);
  }

  /**
 * Handles sending a verification code to the users number.
 * @func sendVerificationCode
 *
 * @param {object}   req
 *
 * @param {Object}   res
 *
 * @return {Response}
 */
  static async sendVerificationCode(req: Request,res: Response){
    const {phoneNumber} =req.body
    const validate = isRequired({ phoneNumber });
    const phoneNumberExists = await getPhoneNumber(res,phoneNumber);

    const code = Math.floor(Math.random() * 90000) + 10000

    if(validate){
      return resHandler(res,false,validate);
    }

    if(!phoneNumberExists){
      return resHandler(res,false,'Phone number not found',404);
    }

    sendCode(phoneNumber,code).then(async (result: any)=>{
      if (result.body){
        const token = await generateToken(res,{phoneNumber,code},'300000')

        return resHandler(res,true,token,200);
      }
    }).catch((err: any)=>{
      if (err.message.includes('unverified numbers')){
        return resHandler(res,false,'Invalid Phone Number')
      }

      return resHandler(res,false,err.message)
    })
  }

  /**
 * Handles phone number verification.
 * @func verifyUser
 *
 * @param {object}   req
 *
 * @param {Object}   res
 *
 * @return {Response}
 */
  static async verifyUser(expressRequest: Request,res: Response){
    const req = expressRequest as userRequest;
    const {code} = req.headers
    const{verificationCode}=req.body
    const validate = isRequired({ verificationCode });

    if (!code){
      return resHandler(res,false,'missing code header')
    }

    if(validate){
      return resHandler(res,false,validate);
    }
    const decoded= await decodeToken(res,code)
    if(!decoded.code){
      return;
    }

    if(decoded.code!==parseInt(verificationCode)){
      return resHandler(res,false,'Invalid code')
    }

    const text = 'UPDATE users SET is_verified=$1 WHERE phone_number=$2 RETURNING id,phone_number';
    const values = [true,decoded.phoneNumber];
    const result = await dbQuery(res,text,values)

    return resHandler(res,true,result,200);
  }

  /**
 * Updates user profile
 * @func updateProfile
 *
 * @param {object}   req
 *
 * @param {Object}   res
 *
 * @return {Response}
 */
  static async updateProfile(expressRequest: Request,res: Response){
    const req = expressRequest as userRequest;
    const{firstName,lastName,email}=req.body
    let imageUrl

    const validate = isRequired({firstName,lastName,email})
    const user = await getUser(req.params.id)
    if(!user.data){
      return resHandler(res,false,'User not found',404);
    }

    if(user.data.id !== req.user.id){
      return resHandler(res,false,'You cannot edit another person`s profile',400);
    }

    if(validate){
      return resHandler(res,false,validate);
    }

    if(req.file){
      const file = dataUri(req).content;
      const result = await uploader.upload(file);
      imageUrl = result.url;
    }
    const text = 'UPDATE users SET first_name=$1,last_name=$2,email=$3,profile_picture=$4,updated_at=$5 WHERE id=$6 RETURNING *';
    const values = [firstName,lastName,email,imageUrl,today,req.params.id];

    const result = await dbQuery(res,text,values)
    await delete result.password

    return resHandler(res,true,result,200);
  }

  /**
 * set user password
 * @func setPassword
 *
 * @param {object}   req
 *
 * @param {Object}   res
 *
 * @return {Response}
 */
  static async setPassword(req: Request,res: Response){
    const{password, confirmPassword}=req.body
    const saltRounds = 10;

    const validate = validatePassword(password, confirmPassword)
    const user = await getUser(req.params.id)

    // eslint-disable-next-line @typescript-eslint/camelcase
    if(!user?.data?.is_verified){
      return resHandler(res,false,'Please verify your phone number',400);
    }

    if(!user?.data){
      return resHandler(res,false,'User not found',404);
    }

    if(validate){
      return resHandler(res,false,validate);
    }

    bcrypt.hash(password, saltRounds)
      .then(async hash=> {
        const text = 'UPDATE users SET password=$1, updated_at=$2 WHERE id=$3 RETURNING id,first_name, phone_number, email';
        const values = [hash,today,req.params.id];
        const result = await dbQuery(res,text,values)

        return resHandler(res,true,result,200);
      }).catch((err)=>{
        return resHandler(res,true,err.message,400);
      })
  }

  /**
 * login a user
 * @func login
 *
 * @param {object}   req
 *
 * @param {Object}   res
 *
 * @return {Response}
 */
  static async login(req: Request,res: Response){
    const{password, phoneNumber}=req.body
    const text = `
    SELECT
      users.id id,
      email,
      first_name,
      last_name,
      password,
      phone_number,
      is_verified,
      roles.id role_id,
      roles.name role_name
      FROM roles INNER JOIN users ON (users.role = roles.id)
      WHERE phone_number=$1
    `
    const values = [phoneNumber];
    const validate = isRequired({ password, phoneNumber });

    if(validate){
      return resHandler(res,false,validate);
    }
    
    const user = await dbQuery(res,text,values)


    if(!user || !user?.password){

      return resHandler(res,false,'Wrong password or phone number');
    }

    if(user.is_verified==false){
      return resHandler(res,false,'Please verify your account first');
    }

    bcrypt.compare(password, user.password).then(async resp => {
      const tokenData ={
        id:user.id,
        role:{
          id:user.role_id, 
          name:user.role_name
        }
      }
      if(resp){
        const token = await generateToken(res,tokenData,'12h')
        delete user.password
        const {role_name,role_id, ...rest}=  user
        const userData = {
          ...rest,
          role:{
            id:role_id,
            name:role_name
          }
        }

        return resHandler(res,true,{token,user:userData},200);
      }
      return resHandler(res,false,'Wrong Password or Phone number');
    })
      .catch((err)=>{

        return resHandler(res,true,err.message,400);
      })
  }
}

/**
 * Handles validations checks for UserController.
 * @func handleChecks
 *
 * @param {object}   data
 *
 * @return {String}
 */
const handleChecks = async( res: Response,data: any)=>{

  const { email,phoneNumber,role, accountBalance } = data;
  const validate = isRequired({ email,phoneNumber,role});
  const validateEmail = email && isEmail(email)
  const userRole = await getRole(role);
  const phoneNumberExists = await getPhoneNumber(res,phoneNumber);
  const isValidPhoneNumber = validatePhoneNumber(phoneNumber);

  if (validate){
    return validate;
  }
  if(isNaN(accountBalance)){
    return 'Account balance should be a number';
  }
  if (validateEmail){
    return validateEmail;
  }

  if (!isValidPhoneNumber){
    return 'Invalid phone number';
  }

  if(userRole.error){
    return 'Role does not exist';
  }
  if(phoneNumberExists){

    return 'Phone number already exists';
  }
};

export default User;
