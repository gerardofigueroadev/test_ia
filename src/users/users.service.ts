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
}
