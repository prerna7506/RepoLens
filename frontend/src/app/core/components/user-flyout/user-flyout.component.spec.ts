import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UserFlyoutComponent } from './user-flyout.component';

describe('UserFlyoutComponent', () => {
  let component: UserFlyoutComponent;
  let fixture: ComponentFixture<UserFlyoutComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserFlyoutComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UserFlyoutComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
