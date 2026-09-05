import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CodeExplorerComponent } from './code-explorer.component';

describe('CodeExplorerComponent', () => {
  let component: CodeExplorerComponent;
  let fixture: ComponentFixture<CodeExplorerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CodeExplorerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CodeExplorerComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
