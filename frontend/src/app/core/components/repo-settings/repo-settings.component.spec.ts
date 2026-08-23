import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RepoSettingsComponent } from './repo-settings.component';

describe('RepoSettingsComponent', () => {
  let component: RepoSettingsComponent;
  let fixture: ComponentFixture<RepoSettingsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RepoSettingsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(RepoSettingsComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
