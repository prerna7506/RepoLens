import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QueryHistoryComponent } from './query-history.component';

describe('QueryHistoryComponent', () => {
  let component: QueryHistoryComponent;
  let fixture: ComponentFixture<QueryHistoryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QueryHistoryComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(QueryHistoryComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
