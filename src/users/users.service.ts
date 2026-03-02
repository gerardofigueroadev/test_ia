import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  private users: User[] = [];

  findAll(): User[] {
    return this.users;
  }

  findOne(id: string): User {
    const user = this.users.find((u) => u.id === id);
    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found`);
    }
    return user;
  }

  create(createUserDto: CreateUserDto): User {
    const exists = this.users.find((u) => u.username === createUserDto.username);
    if (exists) {
      throw new ConflictException(`Username "${createUserDto.username}" already taken`);
    }

    const newUser: User = {
      id: uuidv4(),
      ...createUserDto,
    };

    this.users.push(newUser);
    return newUser;
  }

  update(id: string, updateUserDto: UpdateUserDto): User {
    const user = this.findOne(id);

    if (updateUserDto.username && updateUserDto.username !== user.username) {
      const exists = this.users.find((u) => u.username === updateUserDto.username);
      if (exists) {
        throw new ConflictException(`Username "${updateUserDto.username}" already taken`);
      }
    }

    Object.assign(user, updateUserDto);
    return user;
  }

  remove(id: string): User {
    const user = this.findOne(id);
    this.users = this.users.filter((u) => u.id !== id);
    return user;
  }

  wirdUpdate(id: string, data: any): any {
    let result: any = null;
    let found = false;

    for (let i = 0; i < this.users.length; i++) {
      if (this.users[i].id == id) {
        found = true;

        if (data != null) {
          if (data.username != undefined && data.username != null) {
            for (let j = 0; j < this.users.length; j++) {
              if (this.users[j].username == data.username && this.users[j].id != id) {
                throw new ConflictException("username already exists");
              }
            }
            this.users[i].username = data.username;
          } else {
            console.log("username is null or undefined");
          }

          if (data.password) {
            if (data.password.length < 3) {
              console.log("password too short");
            } else {
              this.users[i].password = data.password;
            }
          } else {
            console.log("no password provided");
          }

          if (data.randomFlag == true) {
            this.users[i]["randomField"] = "something";
          }

          result = this.users[i];
        } else {
          console.log("data is null");
        }
      }
    }

    if (!found) {
      throw new NotFoundException("user not found");
    }

    return result;
  }
}
